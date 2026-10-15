'use strict';

const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const sqlite3 = require('sqlite3').verbose();
const handlers = require('../src/services/primitiveHandlers/proceduralHandlers');
const registry = require('../src/services/proceduralRegistryService');
const runner = require('./helpers/controlled_causal_runner');
const RESOURCE_AUTHORITY = 'permit:single-resource-task';

function databaseAdapter(db) {
  return {
    exec: (sql) => new Promise((resolve, reject) => db.exec(sql, (error) => error ? reject(error) : resolve())),
    run: (sql, params) => new Promise((resolve, reject) => db.run(sql, params, function done(error) {
      if (error) return reject(error);
      resolve({ changes: this.changes });
    })),
    get: (sql, params) => new Promise((resolve, reject) => db.get(sql, params, (error, row) => error ? reject(error) : resolve(row))),
    all: (sql, params) => new Promise((resolve, reject) => db.all(sql, params, (error, rows) => error ? reject(error) : resolve(rows))),
  };
}

function openDb(filename) {
  const raw = new sqlite3.Database(filename);
  return { raw, db: databaseAdapter(raw) };
}

function registerRuntime() {
  registry.registerSnapshot('interrupt-snapshot', { step: 0, value: 0 });
  registry.registerEnvironment('interrupt-environment', { revision: 'fixed-1' });
  registry.registerRunner('interrupt-runner', runner);
  registry.registerSnapshot('authority-snapshot', { available: 1, completed: 0 });
  registry.registerEnvironment('authority-environment', { revision: 'authority-fixed-1', requiredAuthority: RESOURCE_AUTHORITY });
  registry.registerRunner('authority-runner', async (arm, state, control) => {
    if (arm.authority === RESOURCE_AUTHORITY && state.available >= 1) {
      state.available -= 1;
      state.completed += 1;
    }
    await control.checkpoint(state);
    return { metric: state.completed, available: state.available,
      trajectory: [{ completed: state.completed, available: state.available }] };
  });
}

async function createFixture(db) {
  await db.exec('CREATE TABLE schema_migrations (version TEXT PRIMARY KEY, description TEXT)');
  await require('../src/db/migrations/migrateProceduralCausalExperiments').migrateProceduralCausalExperiments(db);
  const spec = { experimentId: 'causal-interruption-e2e', protocolVersion: 'v1', runnerId: 'interrupt-runner',
    environmentId: 'interrupt-environment', environmentManifest: { revision: 'fixed-1' },
    snapshots: [{ snapshotId: 'interrupt-snapshot', state: { step: 0, value: 0 } }],
    arms: { control: { delta: 0 }, intervention: { delta: 2, pauseAfterCheckpoint: true } },
    seeds: [41, 43], budget: { maxSteps: 3, maxRuns: 4 }, analysis: { bootstrapReplicates: 100, analysisSeed: 41 } };
  await handlers.createCausalExperiment({ db, spec });
  return { spec, baseline: await handlers.createCausalFork({ db, experimentId: spec.experimentId,
    snapshotId: 'interrupt-snapshot', arm: 'control', seed: 41 }),
  secondBaseline: await handlers.createCausalFork({ db, experimentId: spec.experimentId,
    snapshotId: 'interrupt-snapshot', arm: 'control', seed: 43 }) };
}

async function runBaseline(db, forkId) {
  return handlers.replayCausalFork({ db, forkId, runnerId: 'interrupt-runner',
    environmentId: 'interrupt-environment', snapshotId: 'interrupt-snapshot' });
}

async function runAuthorityPair(db) {
  const experimentId = 'causal-authority-resource-e2e';
  const initialState = { available: 1, completed: 0 };
  const environmentManifest = { revision: 'authority-fixed-1', requiredAuthority: RESOURCE_AUTHORITY };
  await handlers.createCausalExperiment({ db, spec: { experimentId, protocolVersion: 'v1',
    runnerId: 'authority-runner', environmentId: 'authority-environment', environmentManifest,
    snapshots: [{ snapshotId: 'authority-snapshot', state: initialState }],
    arms: { control: { authority: null }, intervention: { authority: RESOURCE_AUTHORITY } },
    seeds: [47], budget: { maxSteps: 1, maxRuns: 2 },
    analysis: { bootstrapReplicates: 100, analysisSeed: 47 } } });
  const controlFork = await handlers.createCausalFork({ db, experimentId,
    snapshotId: 'authority-snapshot', arm: 'control', seed: 47 });
  const interventionFork = await handlers.createCausalFork({ db, experimentId,
    snapshotId: 'authority-snapshot', arm: 'intervention', seed: 47 });
  for (const fork of [controlFork, interventionFork]) {
    await handlers.replayCausalFork({ db, forkId: fork.forkId, runnerId: 'authority-runner',
      environmentId: 'authority-environment', snapshotId: 'authority-snapshot',
      environmentManifest, snapshotState: initialState });
  }
  const [control, intervention] = await Promise.all([controlFork, interventionFork].map(({ forkId }) =>
    require('../src/services/proceduralCausalExperimentService').loadFork(db, forkId)));
  assert.deepEqual(control.state, { available: 1, completed: 0 }, 'the no-authority oracle must leave the resource untouched');
  assert.deepEqual(intervention.state, { available: 0, completed: 1 }, 'matching authority must consume exactly one resource');
  for (const fork of [control, intervention]) {
    assert.equal(fork.events.filter((event) => event.event_type === 'CHECKPOINT').length, 1);
    assert.equal(fork.events.filter((event) => event.event_type === 'RUN_RESULT').length, 1);
  }
  const diff = await handlers.diffCausalForks({ db, baselineForkId: controlFork.forkId,
    interventionForkId: interventionFork.forkId });
  assert.equal(diff.seed, 47);
  assert.equal(diff.snapshotHash, require('../src/services/proceduralCausalExperimentService').digest(initialState));
  assert.equal(diff.scoreDelta, 1);
  return diff;
}

function waitForCheckpoint(child) {
  return new Promise((resolve, reject) => {
    let output = '';
    const timer = setTimeout(() => reject(new Error('runner did not persist its checkpoint')), 15000);
    child.stdout.on('data', (chunk) => {
      output += chunk.toString();
      if (output.includes('CHECKPOINT_READY')) { clearTimeout(timer); resolve(); }
    });
    child.once('error', (error) => { clearTimeout(timer); reject(error); });
    child.once('exit', (code) => {
      if (!output.includes('CHECKPOINT_READY')) { clearTimeout(timer); reject(new Error(`runner exited before checkpoint (${code})`)); }
    });
  });
}

async function killAfterCheckpoint(filename, forkId) {
  const child = spawn(process.execPath, [path.join(__dirname, 'helpers', 'causal_interruption_child.js'), filename, forkId],
    { stdio: ['ignore', 'pipe', 'pipe'] });
  await waitForCheckpoint(child);
  const status = child.exitCode !== null || child.signalCode !== null
    ? { code: child.exitCode, signal: child.signalCode }
    : await new Promise((resolve) => {
      child.once('exit', (code, signal) => resolve({ code, signal }));
      if (child.exitCode === null && child.signalCode === null) child.kill();
    });
  const { code, signal } = status;
  if (code !== null || !signal) throw new Error(`expected forced interruption; got ${code}/${signal}`);
}

async function main() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'genos-causal-interruption-'));
  const filename = path.join(directory, 'causal.db');
  const { raw, db } = openDb(filename);
  try {
    registerRuntime();
    const { baseline, secondBaseline } = await createFixture(db);
    const control = await runBaseline(db, baseline.forkId);
    const intervention = await handlers.createCausalFork({ db, experimentId: 'causal-interruption-e2e',
      snapshotId: 'interrupt-snapshot', arm: 'intervention', seed: 41 });
    const secondIntervention = await handlers.createCausalFork({ db, experimentId: 'causal-interruption-e2e',
      snapshotId: 'interrupt-snapshot', arm: 'intervention', seed: 43 });
    await new Promise((resolve, reject) => raw.close((error) => error ? reject(error) : resolve()));
    await killAfterCheckpoint(filename, intervention.forkId);

    const reopened = openDb(filename);
    const paused = await require('../src/services/proceduralCausalExperimentService').loadFork(reopened.db, intervention.forkId);
    assert.equal(paused.status, 'running', 'the killed runner must leave its durable lease/checkpoint for recovery');
    assert.equal(paused.checkpoint_version, 1);
    assert.deepEqual(paused.state, { step: 1, value: 2 });
    assert.equal(paused.events.filter((event) => event.event_type === 'CHECKPOINT').length, 1);
    await reopened.db.run("UPDATE procedural_causal_forks SET lease_until = datetime('now', '-1 second') WHERE fork_id = ?", [intervention.forkId]);
    await new Promise((resolve, reject) => reopened.raw.close((error) => error ? reject(error) : resolve()));

    const resumed = spawn(process.execPath, [path.join(__dirname, 'helpers', 'causal_interruption_child.js'), filename, intervention.forkId],
      { stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    let errors = '';
    resumed.stdout.on('data', (chunk) => { output += chunk.toString(); });
    resumed.stderr.on('data', (chunk) => { errors += chunk.toString(); });
    const exit = await new Promise((resolve, reject) => {
      resumed.once('error', reject);
      resumed.once('exit', (code) => resolve(code));
    });
    assert.equal(exit, 0, errors || 'resumed runner process failed');
    const result = JSON.parse(output.trim());
    assert.equal(result.result.metric, 6, 'resume must finish from step 1 without repeating its first mutation');

    const verify = openDb(filename);
    const completed = await require('../src/services/proceduralCausalExperimentService').loadFork(verify.db, intervention.forkId);
    assert.equal(completed.status, 'completed');
    assert.equal(completed.checkpoint_version, 3);
    assert.equal(completed.events.filter((event) => event.event_type === 'CHECKPOINT').length, 3);
    assert.equal(completed.events.filter((event) => event.event_type === 'RUN_RESULT').length, 1);
    const diff = await handlers.diffCausalForks({ db: verify.db, baselineForkId: baseline.forkId, interventionForkId: intervention.forkId });
    assert.equal(diff.seed, 41);
    assert.equal(diff.snapshotHash, require('../src/services/proceduralCausalExperimentService').digest({ step: 0, value: 0 }));
    assert.equal(diff.scoreDelta, 6);
    assert.equal(diff.attributionScope, 'observed-divergent-steps-under-declared-runner-snapshot-environment-and-seed');
    await runBaseline(verify.db, secondBaseline.forkId);
    await runBaseline(verify.db, secondIntervention.forkId);
    const secondCompleted = await require('../src/services/proceduralCausalExperimentService').loadFork(verify.db, secondIntervention.forkId);
    assert.equal(secondCompleted.status, 'completed');
    assert.equal(secondCompleted.checkpoint_version, 3);
    assert.equal(secondCompleted.events.filter((event) => event.event_type === 'RUN_RESULT').length, 1);
    const secondDiff = await handlers.diffCausalForks({ db: verify.db,
      baselineForkId: secondBaseline.forkId, interventionForkId: secondIntervention.forkId });
    assert.equal(secondDiff.seed, 43);
    assert.equal(secondDiff.scoreDelta, 6, 'the declared second seed must reproduce the paired effect');
    assert.equal(secondDiff.snapshotHash, diff.snapshotHash);
    const authorityDiff = await runAuthorityPair(verify.db);
    await new Promise((resolve, reject) => verify.raw.close((error) => error ? reject(error) : resolve()));
    console.log(`Procedural causal E2E: interruption delta=6 at seeds 41/43; authority-gated resource delta=${authorityDiff.scoreDelta} at seed 47.`);
  } finally {
    try { await new Promise((resolve) => raw.close(() => resolve())); } catch (_) { /* already closed */ }
    registry.unregisterSnapshot('interrupt-snapshot');
    registry.unregisterSnapshot('authority-snapshot');
    registry.unregisterEnvironment('interrupt-environment');
    registry.unregisterEnvironment('authority-environment');
    registry.unregisterRunner('interrupt-runner');
    registry.unregisterRunner('authority-runner');
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
