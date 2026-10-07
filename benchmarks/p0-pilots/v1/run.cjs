'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const environment = require('./environment.cjs');

function setup(root) {
  Object.assign(process.env, { NODE_ENV: 'test', GENOS_DISABLE_DOTENV: '1', GENOS_DB_BACKUP_SKIP: '1',
    GENOS_DB_PATH: path.join(root, 'runtime.db'), GENOS_STUDIO_ROOT: path.join(root, 'studio'),
    GENOS_ADMIN_PASSWORD: 'pilot-fixture-only', GENOS_EMBEDDING_PROVIDER: 'none' });
  for (const key of ['OPENAI_API_KEY', 'GEMINI_API_KEY', 'GENOS_EMBEDDING_API_KEY']) delete process.env[key];
}

function tasksFor(pilot, split) {
  const all = JSON.parse(fs.readFileSync(path.join(__dirname, 'public', pilot + '.json')));
  return { tasks: all.filter(task => task.split === split), examples: require('./prompts.cjs').examplesFor(all) };
}

function order(arms, identity) {
  return arms.slice().sort((a, b) => environment.digest(identity + a).localeCompare(environment.digest(identity + b)));
}

async function executeTask(spec) {
  const { protocol, pilot, task, context, output, seed } = spec;
  const memory = pilot === 'memory' ? await require('./memory-probe.cjs').prepare(task,
    { root: context.root, bytes: protocol.pilots.memory.memoryBlockBytes }) : null;
  const rows = [];
  const arms = order(protocol.pilots[pilot].arms, seed + task.id);
  for (const arm of arms) {
    const started = Date.now();
    const row = await require('./arm.cjs').runArm({ ...spec, arm, memory,
      context: { ...context, caseDeadlineAt: started + protocol.caseDeadlineMs } });
    row.durationMs = Date.now() - started;
    if (memory) row.memoryEvidence = { retrievedIds: memory.retrievedIds, backgroundIds: memory.backgroundIds,
      guards: memory.guards, embedding: memory.embedding };
    fs.appendFileSync(path.join(output, 'responses.jsonl'), JSON.stringify(row) + '\n');
    console.log(JSON.stringify({ pilot, caseId: task.id, arm, selected: row.chosen,
      failures: row.attempts.filter(attempt => attempt.error).length, durationMs: row.durationMs }));
    rows.push(row);
  }
  await require('../../../backend/src/services/telemetryObserver').flush();
  return rows;
}

async function verifyFrozen(protocol, frozen) {
  const sources = environment.sourceHashes();
  const dependencies = environment.dependencyHashes();
  const model = await environment.modelIdentity(protocol);
  const lean = environment.leanIdentity();
  if (frozen) {
    if (environment.drift(frozen.sources, sources).length) throw new Error('Frozen source drift');
    if (environment.drift(frozen.dependencies, dependencies).length) throw new Error('Frozen dependency drift');
    if (environment.digest(frozen.model) !== environment.digest(model)) throw new Error('Frozen provider drift');
    if (environment.digest(frozen.lean) !== environment.digest(lean)) throw new Error('Frozen Lean drift');
    if (frozen.host.nodeHash !== environment.hostIdentity().nodeHash) throw new Error('Frozen Node drift');
  }
  return { sources, dependencies, model, lean, host: environment.hostIdentity() };
}

async function executeCampaign(spec) {
  const { protocol, output, context, split, seed } = spec;
  const started = Date.now();
  const warmup = await require('./candidate.cjs').generate({ protocol, budget: { maxOutputTokens: 32 },
    prompt: 'Return only JSON {"ready":true}.', seed });
  if (warmup.error) throw new Error('Provider preflight failed: ' + warmup.error);
  fs.writeFileSync(path.join(output, 'warmup.json'), JSON.stringify(warmup, null, 2));
  const rows = [];
  for (const pilot of Object.keys(protocol.pilots)) {
    const cohort = tasksFor(pilot, split);
    for (const task of cohort.tasks) {
      if (Date.now() - started > 3600000) throw new Error('Campaign deadline exceeded');
      rows.push(...await executeTask({ protocol, output, context, seed, split, pilot, task, examples: cohort.examples }));
    }
  }
  return rows;
}

function specification() {
  const split = process.argv[2];
  if (!['dev', 'holdout'].includes(split)) throw new Error('Usage: run.cjs dev|holdout output [frozen-manifest] [replica-index]');
  const output = path.resolve(process.argv[3]);
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.mkdirSync(output);
  const protocol = JSON.parse(fs.readFileSync(path.join(__dirname, 'protocol.json')));
  environment.validateAssets();
  const frozen = process.argv[4] ? JSON.parse(fs.readFileSync(process.argv[4])) : null;
  if (split === 'holdout' && !frozen) throw new Error('Holdout requires a pre-existing frozen manifest');
  const operator = process.env.PILOT_OPERATOR_ID;
  if (!operator) throw new Error('PILOT_OPERATOR_ID required');
  const index = Number(process.argv[5] || 0);
  if (![0, 1].includes(index)) throw new Error('Invalid preregistered replica index');
  return { split, output, protocol, frozen, operator, index };
}

async function main() {
  const { split, output, protocol, frozen, operator, index } = specification();
  const before = await verifyFrozen(protocol, frozen);
  if (!before.lean.raw.includes('version ' + protocol.leanVersion)) throw new Error('Unexpected Lean version');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'genos-three-pilots-'));
  setup(root);
  const context = { root, lean: before.lean, environmentDigest: environment.digest(before.sources) };
  fs.writeFileSync(path.join(output, 'run-manifest.json'), JSON.stringify({ protocol, split, operator,
    processId: process.pid, parentProcessId: process.ppid, seed: protocol.seeds[index],
    startedAt: new Date().toISOString(), frozenHash: frozen ? environment.digest(frozen) : null,
    before }, null, 2));
  try {
    const rows = await executeCampaign({ protocol, output, context, split, seed: protocol.seeds[index] });
    const after = await verifyFrozen(protocol, frozen);
    const drift = environment.drift(before.sources, after.sources);
    const dependencyDrift = environment.drift(before.dependencies, after.dependencies);
    fs.writeFileSync(path.join(output, 'collection.json'), JSON.stringify({ rows: rows.length,
      calls: 1 + rows.reduce((sum, row) => sum + row.callCount, 0), warmupCalls: 1,
      errors: rows.flatMap(row => row.attempts).filter(attempt => attempt.error).length,
      drift, dependencyDrift, modelDigest: after.model.digest, completedAt: new Date().toISOString() }, null, 2));
    if (drift.length || dependencyDrift.length || rows.some(row => row.attempts.some(attempt => attempt.error))) process.exitCode = 1;
  } finally {
    await require('../../../backend/src/services/telemetryObserver').flush();
    await require('../../../backend/src/db').closeDatabase();
    fs.rmSync(root, { recursive: true, force: true, maxRetries: 6, retryDelay: 200 });
  }
}

if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });
module.exports = { setup, tasksFor, order, verifyFrozen };
