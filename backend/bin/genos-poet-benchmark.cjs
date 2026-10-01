#!/usr/bin/env node
'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
function problem(seed, heldOut) {
  const a = (seed * 17) % 97 + 2;
  const b = (seed * 31) % 89 + 3;
  const offset = heldOut ? 13 : 5;
  return { goal: `Write solution.json containing {"answer":${a} * ${b} + ${offset}} with the computed integer, not an expression.`,
    expected: a * b + offset, a, b, offset };
}
async function environment(context, heldOut) {
  const kind = heldOut ? 'heldout' : 'training';
  const id = `seed-${context.seed}-${kind}`;
  const workspacePath = path.join(context.root, id);
  const task = problem(context.seed, heldOut);
  task.goal += '\nFor a local runtime, return [ARTIFACT: solution.json] the computed JSON [/ARTIFACT] so its authorized file adapter writes the solution.';
  await fs.mkdir(workspacePath, { recursive: true });
  await fs.writeFile(path.join(workspacePath, 'package.json'), JSON.stringify({ private: true, scripts: { test: 'node verify.cjs' } }));
  await fs.writeFile(path.join(workspacePath, 'verify.cjs'), `const fs=require('node:fs');const assert=require('node:assert/strict');assert.equal(JSON.parse(fs.readFileSync('solution.json','utf8')).answer,${task.expected});console.log('verified');\n`);
  const workspaceId = context.workspaceId;
  return { id, workspaceId, workspacePath, db: context.db, goals: [task.goal], constraints: { arithmetic: [task.a, task.b, task.offset] },
    artifactPath: 'solution.json', protectedPaths: ['package.json', 'verify.cjs'], difficulty: heldOut ? 0.4 : 0.2,
    executionPolicy: { allowFileEdits: true, requestedWorkers: 0 },
    stats: { attemptCount: 0, solvedCount: 0, bestScore: 0 } };
}
async function registerAgent(context, id) {
  await context.db.run("INSERT INTO agents (id, name, role, status, execution_mode, workspace_id) VALUES (?, ?, 'orchestrator', 'idle', 'orchestrator', ?)", id, id, context.workspaceId);
  await require('../src/services/strategyContractService').saveContract(context.db, { agentId: id, workspaceId: context.workspaceId, problem: 'Solve a bounded arithmetic file task with an executable verifier' });
}
async function agent(context) {
  const id = `poet-${context.runId}-${context.seed}`;
  const executionAgentIds = {};
  for (const kind of ['training', 'heldout']) {
    const executionId = `${id}-${kind}`;
    await registerAgent(context, executionId);
    executionAgentIds[`seed-${context.seed}-${kind}`] = executionId;
  }
  return { id, executionAgentIds, role: 'solver', autonomousOrchestration: false,
    toolLease: ['genos_execute_primitive'], executor: process.env.GENOS_POET_EXECUTOR || 'codex',
    executionBudget: { tokens: 140000, costUsd: 1, workerShare: 0, orchestratorReserve: 1 } };
}
async function runSeed(context) {
  const solver = await agent(context);
  const training = await environment(context, false);
  const heldOut = await environment(context, true);
  const result = await require('../src/services/poetBridgeService').evaluateGeneralization([solver],
    { training: [training], heldOut: [heldOut] }, { timeoutMs: context.timeoutMs });
  const runtimeEvidence = [];
  for (const id of Object.values(solver.executionAgentIds)) {
    const rows = await context.db.all("SELECT event_type, payload_json FROM telemetry_events WHERE agent_id = ? AND event_type IN ('AGENT_RUNTIME_STARTED', 'EVIDENCE_REPORT', 'AGENT_HALTED', 'AGENT_RUNTIME_ERROR', 'AGENT_FAILED')", id);
    runtimeEvidence.push({ agentId: id, events: rows });
  }
  console.log(JSON.stringify({ seed: context.seed, measured: result.measured, training: result.training, heldOut: result.heldOut }));
  return { seed: context.seed, result, runtimeEvidence };
}
async function protocolHashes() {
  const sources = [__filename, path.resolve(__dirname, '../src/services/poetExecutionEngine.js'),
    path.resolve(__dirname, '../src/services/poetExecutionEvidence.js'), path.resolve(__dirname, '../src/services/poetBridgeService.js'),
    path.resolve(__dirname, 'local-codex-runtime.cjs'), path.resolve(__dirname, 'genos-agent-runtime.cjs')];
  const hashes = [];
  for (const file of sources) hashes.push({ path: path.relative(path.resolve(__dirname, '../..'), file),
    sha256: crypto.createHash('sha256').update(await fs.readFile(file)).digest('hex') });
  return hashes;
}
function seedInput() {
  const seeds = String(process.argv[2] || '1,7,42').split(',').map(Number);
  if (seeds.length < 1 || seeds.length > 10 || seeds.some((seed) => !Number.isSafeInteger(seed) || seed < 0)) throw new Error('Provide 1 to 10 non-negative integer seeds');
  if (new Set(seeds).size !== seeds.length) throw new Error('Seeds must be unique');
  return seeds;
}
async function run() {
  const seeds = seedInput();
  const runId = crypto.randomUUID();
  const root = path.resolve(process.argv[3] || path.join('.genos', 'benchmarks', 'poet', runId));
  await fs.mkdir(root, { recursive: true });
  await fs.mkdir(path.join(root, '.genos', 'control'), { recursive: true });
  process.env.GENOS_DB_PATH = path.join(root, '.genos', 'control', 'benchmark.db');
  process.env.GENOS_DISABLE_WORKSPACE_GC = '1';
  process.env.GENOS_ADMIN_PASSWORD = crypto.randomBytes(32).toString('hex');
  const { getDatabase, closeDatabase } = require('../src/db');
  const db = await getDatabase();
  const workspaceId = `poet-workspace-${runId}`;
  await db.run('INSERT INTO workspaces (id, name, path) VALUES (?, ?, ?)', workspaceId, 'POET benchmark', root);
  const results = [];
  try {
    for (const seed of seeds) results.push(await runSeed({ seed, root, runId, db, workspaceId, timeoutMs: 120000 }));
    const revision = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
    const workingTreeDigest = crypto.createHash('sha256').update(execFileSync('git', ['diff', 'HEAD', '--', 'backend', 'crates', 'shared'])).digest('hex');
    const report = { schema: 'genos.poet-benchmark/v1', revision, workingTreeDigest, seeds, node: process.version,
      executor: process.env.GENOS_POET_EXECUTOR || 'codex', timeoutMs: 120000, tokenLimit: 140000, costLimitUsd: 1,
      protocolHashes: await protocolHashes(),
      taskFamily: 'synthetic arithmetic artifact', results };
    const reportPath = path.join(root, 'report.json');
    await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
    console.log(`POET report: ${reportPath}`);
    if (results.some((item) => !item.result.measured)) process.exitCode = 2;
  } finally {
    await require('../src/services/agentRuntimeAdapter').stopAllMissions();
    await new Promise((resolve) => setTimeout(resolve, 1000));
    await closeDatabase();
  }
}
run().catch((error) => { console.error(error); process.exitCode = 1; });
