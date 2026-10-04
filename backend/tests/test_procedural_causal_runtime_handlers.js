'use strict';

const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const sqlite3 = require('sqlite3').verbose();
const mcpStrategyTools = require('../src/services/mcpStrategyTools');
const registry = require('../src/services/proceduralRegistryService');

async function callCausalPrimitive(db, primitive, input = {}) {
  const dispatched = await mcpStrategyTools.executeStrategyTool('genos_execute_primitive', {
    primitive, context: { db, ...input },
  });
  if (!dispatched?.success) throw new Error(dispatched?.output?.error || `Primitive '${primitive}' failed.`);
  return dispatched.output;
}

function call({ db, method, sql, params = [] }) {
  return new Promise((resolve, reject) => {
    db[method](sql, params, function done(error, result) {
      if (error) return reject(error);
      resolve(method === 'run' ? { changes: this.changes } : result);
    });
  });
}

function databaseAdapter(db) {
  return {
    exec: (sql) => new Promise((resolve, reject) => db.exec(sql, (error) => error ? reject(error) : resolve())),
    run: (sql, params) => call({ db, method: 'run', sql, params }),
    get: (sql, params) => call({ db, method: 'get', sql, params }),
    all: (sql, params) => call({ db, method: 'all', sql, params }),
  };
}

function registerRuntime(snapshotA, snapshotB, environment) {
  const resumeFlags = [];
  registry.registerSnapshot('causal-snapshot-a', snapshotA);
  registry.registerSnapshot('causal-snapshot-b', snapshotB);
  registry.registerEnvironment('causal-env', environment);
  registry.registerRunner('causal-runner', async (arm, state, control) => {
    resumeFlags.push(control.resume);
    await control.checkpoint(state);
    return { metric: arm.metric, trajectory: [{ metric: arm.metric }] };
  });
  return resumeFlags;
}

async function executeArm({ db, experimentId, snapshotId, snapshotState, arm, seed }) {
  const created = await callCausalPrimitive(db, 'procedural_causal_fork_create', { experimentId, snapshotId, snapshotState, arm, seed });
  return callCausalPrimitive(db, 'procedural_causal_replay', {
    forkId: created.forkId, runnerId: 'causal-runner', environmentId: 'causal-env',
    snapshotId, snapshotState, environmentManifest: { version: 1 },
  });
}

async function main() {
  const filename = path.join(__dirname, `causal-runtime-${Date.now()}.db`);
  const raw = new sqlite3.Database(filename);
  const db = databaseAdapter(raw);
  await db.exec('CREATE TABLE schema_migrations (version TEXT PRIMARY KEY, description TEXT)');
  await require('../src/db/migrations/migrateProceduralCausalExperiments').migrateProceduralCausalExperiments(db);
  const stateA = { start: 0 };
  const stateB = { start: 1 };
  const environment = { version: 1 };
  registerRuntime(stateA, stateB, environment);
  const created = await callCausalPrimitive(db, 'procedural_causal_experiment_create', { spec: {
    experimentId: 'runtime-causal-test', protocolVersion: 'v1', runnerId: 'causal-runner',
    environmentId: 'causal-env', environmentManifest: environment,
    snapshots: [{ snapshotId: 'causal-snapshot-a', state: stateA }, { snapshotId: 'causal-snapshot-b', state: stateB }],
    arms: { control: { metric: 0 }, intervention: { metric: 1 } },
    budget: { maxSteps: 8 }, analysis: { bootstrapReplicates: 1000, analysisSeed: 17 },
  } });
  const pairs = [];
  for (const [snapshotId, state] of [['causal-snapshot-a', stateA], ['causal-snapshot-b', stateB]]) {
    const diffs = [];
    for (const seed of [17, 19]) {
      const control = await executeArm({ db, experimentId: created.experimentId, snapshotId, snapshotState: state, arm: 'control', seed });
      const intervention = await executeArm({ db, experimentId: created.experimentId, snapshotId, snapshotState: state, arm: 'intervention', seed });
      const diff = await callCausalPrimitive(db, 'procedural_causal_diff', { baselineForkId: control.forkId, interventionForkId: intervention.forkId });
      assert.equal(diff.snapshotId, snapshotId);
      assert.equal(diff.snapshotHash, require('../src/services/proceduralCausalExperimentService').digest(state));
      assert.equal(diff.seed, seed);
      assert.equal(diff.scoreDelta, 1);
      diffs.push(diff);
    }
    pairs.push({ snapshotId, diffs });
  }
  const analysis = await callCausalPrimitive(db, 'procedural_causal_analyze_snapshots', { experimentId: created.experimentId, analysisSeed: 17,
    bootstrapReplicates: 1000, groups: pairs.map((pair) => ({
      snapshotId: pair.snapshotId, diffIds: pair.diffs.map((diff) => diff.diffId),
    })) });
  assert.equal(analysis.verdict, 'supported_improvement');
  assert.deepEqual(analysis.evidenceRefs.sort(), pairs.flatMap((pair) => pair.diffs.map((diff) => `diff:${diff.diffId}`)).sort());
  assert.deepEqual(analysis.snapshots.map((snapshot) => snapshot.pairCount), [2, 2]);
  const reference = `diff:${pairs[0].diffs[0].diffId}`;
  const graph = await callCausalPrimitive(db, 'procedural_causal_graph', { experimentId: created.experimentId, graph: {
    evidenceRefs: [reference],
    nodes: [
      { id: 'intervention', kind: 'intervention', evidenceRefs: [reference] },
      { id: 'outcome', kind: 'outcome', evidenceRefs: [reference] },
    ],
    edges: [{ source: 'intervention', target: 'outcome', status: 'observed', evidenceRefs: [reference] }],
  } });
  assert.ok(graph.graphId);
  const paused = await callCausalPrimitive(db, 'procedural_causal_fork_create', { experimentId: created.experimentId,
    snapshotId: 'causal-snapshot-b', snapshotState: stateB, arm: 'control', seed: 23 });
  await require('../src/services/proceduralCausalExperimentService').checkpointFork(db, {
    forkId: paused.forkId, expectedVersion: 0, state: stateB, status: 'paused',
  });
  await new Promise((resolve, reject) => raw.close((error) => error ? reject(error) : resolve()));
  const reopened = new sqlite3.Database(filename);
  const reopenedDb = databaseAdapter(reopened);
  registry.unregisterSnapshot('causal-snapshot-a');
  registry.unregisterSnapshot('causal-snapshot-b');
  registry.unregisterEnvironment('causal-env');
  registry.unregisterRunner('causal-runner');
  const rehydratedResumeFlags = registerRuntime(stateA, stateB, environment);
  registry.registerRunner('causal-runner-v2', async () => ({ metric: 2 }));
  await assert.rejects(() => callCausalPrimitive(reopenedDb, 'procedural_causal_replay', {
    forkId: paused.forkId, runnerId: 'causal-runner-v2', environmentId: 'causal-env', snapshotId: 'causal-snapshot-b',
    snapshotState: stateB, environmentManifest: environment }), /CAUSAL_RUNNER_DRIFT/);
  registry.registerSnapshot('causal-snapshot-b', { start: 99 });
  await assert.rejects(() => callCausalPrimitive(reopenedDb, 'procedural_causal_replay', {
    forkId: paused.forkId, runnerId: 'causal-runner', environmentId: 'causal-env', snapshotId: 'causal-snapshot-b',
    snapshotState: stateB, environmentManifest: environment }), /CAUSAL_SNAPSHOT_MISMATCH/);
  registry.registerSnapshot('causal-snapshot-b', stateB);
  registry.registerEnvironment('causal-env', { version: 2 });
  await assert.rejects(() => callCausalPrimitive(reopenedDb, 'procedural_causal_replay', {
    forkId: paused.forkId, runnerId: 'causal-runner', environmentId: 'causal-env', snapshotId: 'causal-snapshot-b',
    snapshotState: stateB, environmentManifest: { version: 2 } }), /CAUSAL_ENV_DRIFT/);
  registry.registerEnvironment('causal-env', environment);
  assert.deepEqual(rehydratedResumeFlags, [], 'drift checks must not start the runner');
  await new Promise((resolve, reject) => reopened.close((error) => error ? reject(error) : resolve()));
  const childOutput = execFileSync(process.execPath, [
    path.join(__dirname, 'helpers', 'replay_procedural_causal_child.js'), filename, paused.forkId,
  ], { encoding: 'utf8' });
  const childResult = JSON.parse(childOutput.trim());
  assert.equal(childResult.resume, true, 'the fresh process must resume from the persisted checkpoint');
  const verifiedRaw = new sqlite3.Database(filename);
  const verifiedDb = databaseAdapter(verifiedRaw);
  const resumedFork = await require('../src/services/proceduralCausalExperimentService').loadFork(verifiedDb, paused.forkId);
  assert.equal(resumedFork.status, 'completed');
  assert.equal(resumedFork.checkpoint_version, 2);
  assert.equal(resumedFork.events.filter((event) => event.event_type === 'CHECKPOINT').length, 2);
  assert.equal(resumedFork.events.filter((event) => event.event_type === 'RUN_RESULT').length, 1);
  await new Promise((resolve, reject) => verifiedRaw.close((error) => error ? reject(error) : resolve()));
  fs.rmSync(filename, { force: true });
  console.log('Procedural causal replay, diff, multi-snapshot analysis and attribution are runtime reachable.');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
