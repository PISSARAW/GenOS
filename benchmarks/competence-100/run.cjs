'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const corpus = require('./corpus.cjs');
const agent = require('./agent.cjs');
const inference = require('./inference.cjs');
const evidence = require('./evidence.cjs');
const statistics = require('./statistics.cjs');
const protocol = require('./protocol.json');
const FALLBACK = { answer: null, confidence: 0, abstain: true, missing: [] };

async function runTask(input, state) {
  const examples = input.db ? await agent.recall(input.db, input.task.expression) : [];
  const result = await inference.attempt({ task: input.task, examples }, state);
  // Persist the answer and its confidence before the oracle is invoked.
  const responseEvent = state.append({ type: 'response', phase: input.phase, arm: input.arm,
    taskId: input.task.id, prompt: agent.prompt(input.task, examples), result });
  const response = result.valid ? result.value : FALLBACK;
  const measured = evidence.oracle({ task: input.task, response, world: state.corpus.world,
    known: Object.keys(state.corpus.world).slice(0, 4) });
  const oracleEvent = state.append({ type: 'oracle', responseEvent, measured });
  const row = { phase: input.phase, arm: input.arm, taskId: input.task.id, family: input.task.family,
    valid: result.valid, response, decision: agent.decision(response), oracle: measured,
    modelBudgetVerified: inference.withinBudget(result, state.model), error: result.error,
    inputTokens: result.inputTokens ?? null, outputTokens: result.outputTokens ?? null,
    elapsedMs: result.elapsedMs, responseEvent, oracleEvent };
  if (input.phase === 'training') {
    await agent.learn(input.db, { task: input.task, expected: measured.expected, oracleEvent });
  }
  state.rows.push(row);
  return row;
}

async function train(state, filename) {
  const db = await agent.connect(filename);
  try {
    for (const task of state.corpus.training) {
      await runTask({ task, db, phase: 'training', arm: 'experienced' }, state);
      const count = state.rows.length;
      if (count % 10 === 0) console.log(`Training ${count}/100`);
    }
    return await agent.stateHash(db);
  } finally { await db.close(); }
}

async function evaluate(state, filename, trainedHash) {
  // A separate process restores the store after the training connection closes.
  const restored = spawnSync(process.execPath, [path.join(__dirname, 'restart.cjs'), filename], {
    encoding: 'utf8', timeout: 10000, windowsHide: true
  });
  if (restored.status !== 0) throw Error('Durable-state restart probe failed');
  const restartedHash = JSON.parse(restored.stdout).stateHash;
  const db = await agent.connect(filename);
  const restoredHash = await agent.stateHash(db);
  const resetFile = path.join(state.directory, 'reset.db');
  const reset = await agent.connect(resetFile);
  const emptyHash = await agent.stateHash(reset);
  const next = corpus.random(state.seeds.order);
  try {
    for (const [index, task] of state.corpus.heldout.entries()) {
      for (const arm of corpus.shuffle(protocol.arms, next)) {
        const connection = { initial: null, experienced: db, reset }[arm];
        await runTask({ task, db: connection, phase: 'heldout', arm }, state);
      }
      if ((index + 1) % 10 === 0) console.log(`Held-out ${index + 1}/${state.corpus.heldout.length}`);
    }
    return { restartRestored: restoredHash === trainedHash && restartedHash === trainedHash,
      heldoutDidNotLearn: await agent.stateHash(db) === trainedHash,
      resetStayedEmpty: await agent.stateHash(reset) === emptyHash };
  } finally { await db.close(); await reset.close(); }
}

function summarize(state, integrity) {
  const rows = state.rows.filter(row => row.phase === 'heldout');
  const byArm = Object.fromEntries(protocol.arms.map(arm => [arm, statistics.metrics(rows.filter(row => row.arm === arm))]));
  const transfer = statistics.comparisons(rows);
  return { schema: 'genos.competence-100.report/v1', manifestHash: state.manifestHash,
    trainingExperiences: state.rows.filter(row => row.phase === 'training').length,
    calls: state.calls, elapsedMs: Date.now() - state.started,
    byArm, transfer, integrity, conclusion: statistics.conclusion({ byArm, transfer, integrity }),
    usageByArm: Object.fromEntries(protocol.arms.map(arm => [arm, usage(rows.filter(row => row.arm === arm))])),
    trainingUsage: usage(state.rows.filter(row => row.phase === 'training')),
    inputTokens: totalTokens(state.rows, 'inputTokens'), outputTokens: totalTokens(state.rows, 'outputTokens'),
    monetaryCost: null, limitations: protocol.limitations };
}

function usage(rows) {
  return { assigned: rows.length, inputTokens: totalTokens(rows, 'inputTokens'),
    outputTokens: totalTokens(rows, 'outputTokens'), elapsedMs: rows.reduce((sum, row) => sum + row.elapsedMs, 0) };
}

function totalTokens(rows, name) {
  return rows.every(row => Number.isInteger(row[name])) ? rows.reduce((sum, row) => sum + row[name], 0) : null;
}

async function main() {
  const model = await inference.describe(process.argv[2] || 'qwen2.5-coder:7b');
  const readiness = await inference.requireReady(model);
  const outputRoot = process.env.GENOS_COMPETENCE_OUTPUT_ROOT
    || path.join(evidence.ROOT, '.genos-agent-worlds', 'competence-100');
  const directory = path.join(path.resolve(outputRoot), crypto.randomUUID());
  fs.mkdirSync(directory, { recursive: true });
  const seeds = Object.fromEntries(['world', 'test', 'order'].map(key => [key, crypto.randomBytes(24).toString('hex')]));
  const generated = corpus.generate(seeds);
  const manifest = { protocol, model, readiness, seeds, corpus: generated, provenance: evidence.provenance(),
    createdAt: new Date().toISOString(), preregistration: 'local-seal-before-first-inference; no independent registry' };
  evidence.write(directory, 'manifest.json', manifest);
  evidence.copySources(directory, manifest.provenance.sources);
  const manifestHash = corpus.hash(manifest);
  console.log(`Evidence: ${directory}\nManifest SHA-256: ${manifestHash}`);
  const state = { directory, model, seeds, manifestHash, corpus: generated,
    rows: [], calls: 0, started: Date.now(), append: evidence.journal(directory) };
  state.append({ type: 'manifest', manifestHash });
  const filename = path.join(directory, 'experienced.db');
  const trainedHash = await train(state, filename);
  state.append({ type: 'trained', experiences: 100, trainedHash });
  const retention = await evaluate(state, filename, trainedHash);
  const after = await inference.describe(model.name);
  const integrity = { ...retention, modelUnchanged: model.digest === after.digest,
    sourcesUnchanged: corpus.hash(manifest.provenance.sources) === corpus.hash(evidence.sourceHashes()),
    completeAssignment: state.rows.length === protocol.maximumCalls,
    exactly100Experiences: state.rows.filter(row => row.phase === 'training').length === 100,
    budgetsVerified: state.rows.every(row => row.modelBudgetVerified),
    withinDuration: Date.now() - state.started <= protocol.maximumDurationMs };
  const report = summarize(state, integrity);
  evidence.write(directory, 'measurements.json', state.rows);
  evidence.write(directory, 'report.json', report);
  state.append({ type: 'report', reportHash: corpus.hash(report), rowsHash: corpus.hash(state.rows) });
  console.log(JSON.stringify(report, null, 2));
  // A negative scientific result is a completed run. Integrity failures are execution failures.
  process.exitCode = Object.values(integrity).every(Boolean) ? 0 : 1;
}

if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });
module.exports = { runTask, summarize };
