'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const corpus = require('./corpus.cjs');
const protocol = require('./protocol.json');
const memory = require('./memory.cjs');
const methods = require('./methods.cjs');
const llm = require('./llm.cjs');
const evidence = require('./evidence.cjs');
const analysis = require('./analysis.cjs');

function order(values, next) {
  const result = [...values];
  for (let i = result.length - 1; i > 0; i--) {
    const j = next(i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

async function predict(input, session) {
  const context = await methods.context(input, session);
  const query = { id: input.query.id, expression: input.query.expression, epochs: input.query.epochs };
  const payload = { query, ...context };
  const model = input.arm === 'synthesis_only' ? null : await llm.attempt(payload, session);
  const tool = input.arm === 'synthesis_only' ? methods.tool(session.history, input.query) : context.affineTool;
  const response = methods.finalize({ arm: input.arm, model, tool });
  const row = { ...input, payload, model, response, budgetVerified: !model || llm.withinBudget(model) };
  session.append({ type: 'prediction', row });
  return row;
}

async function checkpoint(input, session) {
  const worldId = 'world-' + input.world;
  const before = await memory.checkpoint(session.db, worldId);
  const restored = evidence.restored(session.filename, worldId);
  assert.deepEqual(restored, before);
  const historyHash = corpus.hash(session.history);
  const queries = corpus.queries(input.privateWorld, input.checkpoint);
  const next = corpus.random(input.privateWorld.seed + ':order:' + input.checkpoint);
  const rows = [];
  for (const query of queries) {
    for (const arm of order(protocol.arms, next)) rows.push(await predict({
      world: input.world, worldId, checkpoint: input.checkpoint, query, arm }, session));
  }
  const outcomes = evidence.oracle({ world: input.privateWorld, queries, history: session.history });
  const labels = new Map(queries.map((query, i) => [query.id, outcomes[i]]));
  const scored = rows.map(row => ({ ...row, oracle: labels.get(row.query.id) }));
  session.rows.push(...scored);
  assert.equal(corpus.hash(await memory.history(session.db, worldId)), before.observationHash);
  assert.equal(corpus.hash(session.history), historyHash);
  session.append({ type: 'checkpoint', world: input.world, checkpoint: input.checkpoint,
    state: before, restored, rows: scored });
  evidence.write(session.directory, 'measurements.partial.json', session.rows);
  console.log(`World ${input.world + 1}/${protocol.worlds}, experience ${input.checkpoint}, calls ${session.calls}/${protocol.maximumCalls}`);
}

async function runWorld(input, session) {
  session.history = [];
  const worldId = 'world-' + input.world;
  const observations = corpus.observations(input.privateWorld);
  for (const step of protocol.checkpoints) {
    while (session.history.length < step) {
      const observation = observations[session.history.length];
      const eventHash = session.append({ type: 'training_observation', world: input.world, observation });
      session.history.push(observation);
      await memory.ingest(session.db, { worldId, observation, eventHash });
    }
    await checkpoint({ ...input, checkpoint: step }, session);
  }
}

async function finish(session, manifest) {
  const model = await llm.describe();
  const expectedRows = protocol.worlds * protocol.checkpoints.length * protocol.queriesPerCheckpoint * protocol.arms.length;
  const integrity = { completeAssignment: session.rows.length === expectedRows,
    nativeCallAssignment: session.calls === protocol.maximumCalls,
    budgetsVerified: session.rows.every(row => row.budgetVerified),
    allNativeResponsesValid: session.rows.filter(row => row.model).every(row => row.model.valid),
    modelUnchanged: model.digest === manifest.model.digest,
    sourcesUnchanged: corpus.hash(evidence.sourceHashes()) === corpus.hash(manifest.provenance.sources),
    withinDuration: Date.now() - session.started <= protocol.maximumDurationMs,
    restoredAndFrozenEveryCheckpoint: true };
  const results = analysis.report(session.rows);
  const report = { schema: protocol.schema, manifestHash: session.manifestHash,
    modelCalls: session.calls, predictions: session.rows.length,
    trainingObservations: protocol.worlds * 100, elapsedMs: Date.now() - session.started,
    inputTokens: analysis.mean([]), outputTokens: analysis.mean([]), ...results, integrity,
    conclusion: { primaryContrastsSupported: results.contrasts.every(row => row.supported),
      generalCompetenceDemonstrated: false, authorizesPromotion: false } };
  for (const key of ['inputTokens', 'outputTokens']) {
    report[key] = session.rows.filter(row => row.model).reduce((sum, row) => sum + (row.model[key] || 0), 0);
  }
  evidence.write(session.directory, 'measurements.json', session.rows);
  evidence.write(session.directory, 'report.json', report);
  session.append({ type: 'report', reportHash: corpus.hash(report), measurementsHash: corpus.hash(session.rows) });
  console.log(JSON.stringify({ integrity, contrasts: report.contrasts, conclusion: report.conclusion }, null, 2));
  return report;
}

async function main() {
  const model = await llm.describe();
  const readiness = await llm.ready();
  const output = process.env.GENOS_FIVE_ARM_ROOT || 'D:/genos-competence-results/five-arms';
  if (!/^D:[/\\]/i.test(output)) throw Error('Study artifacts must be on D');
  const directory = path.join(output, crypto.randomUUID());
  fs.mkdirSync(directory, { recursive: true });
  const seeds = Array.from({ length: protocol.worlds }, () => crypto.randomBytes(24).toString('hex'));
  const worlds = seeds.map(corpus.world);
  const manifest = { protocol, model, readiness, worlds, createdAt: new Date().toISOString(),
    provenance: evidence.provenance(), preregistration: 'local-seal-before-experimental-inference' };
  evidence.write(directory, 'manifest.json', manifest);
  evidence.copySources(directory, manifest.provenance.sources);
  console.log(`Evidence: ${directory}\nManifest SHA-256: ${corpus.hash(manifest)}`);
  const filename = path.join(directory, 'agent.sqlite');
  const session = { filename, directory, db: await memory.connect(filename), history: [], rows: [],
    started: Date.now(), calls: 0, append: evidence.journal(directory), manifestHash: corpus.hash(manifest) };
  session.append({ type: 'manifest', manifestHash: session.manifestHash });
  try {
    for (let world = 0; world < worlds.length; world++) await runWorld({ world, privateWorld: worlds[world] }, session);
    await finish(session, manifest);
  } finally { await session.db.close(); }
}

if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });
module.exports = { order, predict, checkpoint, runWorld, finish };
