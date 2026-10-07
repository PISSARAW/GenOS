'use strict';

process.env.GENOS_DISABLE_DOTENV = '1';
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const fixture = require('./fixtures/pairedReplayRunner.cjs');
const experiments = require('../src/services/proceduralCausalExperimentService');
const replay = require('../src/services/proceduralCausalReplayService');
const { openDatabase } = require('./helpers/biologyDatabase');
const handlers = require('../src/services/primitiveHandlers/proceduralHandlers').HANDLERS;

async function createFork(db, input) {
  return handlers.procedural_causal_fork_create({ db, experimentId: 'p1-addressed-replay',
    snapshotId: 'paired-snapshot', scope: fixture.scope, ...input });
}

async function freshReplay(filename, forkId) {
  const child = require('node:child_process').spawnSync(process.execPath, [__filename, '--resume', filename, forkId],
    { encoding: 'utf8', timeout: 30000, windowsHide: true });
  assert.equal(child.status, 0, child.stderr);
  const output = JSON.parse(child.stdout.trim());
  assert.notEqual(output.pid, process.pid);
  return output;
}

async function pausedControl(db, fork) {
  const abort = new AbortController();
  const original = db.run;
  let paused = false;
  db.run = async (sql, ...params) => {
    const result = await original(sql, ...params);
    if (!paused && sql.includes('checkpoint_version = checkpoint_version + 1')) { paused = true; abort.abort(); }
    return result;
  };
  try { await assert.rejects(replay.replayFork(db, { ...fixture.replayInput(fork.forkId), signal: abort.signal }), { code: 'TEST_PAUSED' }); }
  finally { db.run = original; }
  const saved = await experiments.loadFork(db, fork.forkId);
  assert.equal(saved.status, 'paused');
  assert.equal(saved.state.cursor, 1);
  assert.equal(saved.events.at(-1).payload.replayObservation.samples.length, 1);
}

async function positive(db, filename) {
  await handlers.procedural_causal_experiment_create({ db, spec: fixture.spec() });
  const groups = [];
  for (const snapshotId of ['paired-snapshot', 'paired-snapshot-b']) {
    const diffIds = [];
  for (const seed of [7, 13, 29]) {
    const control = await createFork(db, { arm: 'control', seed, snapshotId });
    const intervention = await createFork(db, { arm: 'intervention', seed, snapshotId });
    if (seed === 13 && snapshotId === 'paired-snapshot') { await pausedControl(db, control); await freshReplay(filename, control.forkId); }
    else await replay.replayFork(db, fixture.replayInput(control.forkId, snapshotId));
    await handlers.procedural_causal_replay({ db, ...fixture.replayInput(intervention.forkId, snapshotId), snapshotId });
    const query = { baselineForkId: control.forkId, interventionForkId: intervention.forkId, scope: fixture.scope };
    const diff = await handlers.procedural_causal_diff({ db, ...query });
    diffIds.push(diff.diffId);
    assert.equal(diff.firstDivergenceStep, 1);
    assert.ok(Math.abs(diff.scoreDelta - 2) < 1e-12);
    assert.equal(diff.replayControls.sharedAddresses, 3);
    assert.equal(diff.replayControls.causalGuarantee, false);
    const [left, right] = diff.replayControls.observations;
    assert.equal(left.samples.length, 3);
    assert.equal(right.samples.length, 4);
    for (const sample of left.samples) assert.equal(sample.value, right.samples.find(item => item.eventId === sample.eventId && item.slot === sample.slot).value);
    assert.equal((await replay.causalDiff(db, query)).diffHash, diff.diffHash);
    await assert.rejects(replay.causalDiff(db, { ...query, scope: { ...fixture.scope, projectId: 'foreign' } }), { code: 'CAUSAL_REPLAY_SCOPE_MISMATCH' });
    await assert.rejects(replay.replayFork(db, fixture.replayInput(control.forkId, snapshotId)), /CAUSAL_FORK_NOT_RESUMABLE/);
  }
    groups.push({ snapshotId, diffIds });
  }
  assert.deepEqual(require('../src/services/proceduralRegistryService').resolveSnapshot('paired-snapshot'), fixture.initial);
  console.log('Paired replay: two snapshots and three seeds, addressed common draws, known fault at step 1, checkpoint and fresh-process continuation passed.');
  return groups;
}

async function main() {
  fixture.register();
  if (process.argv[2] === '--resume') {
    const db = openDatabase(process.argv[3]);
    try { const result = await replay.replayFork(db, fixture.replayInput(process.argv[4])); console.log(JSON.stringify({ pid: process.pid, result })); }
    finally { await db.close(); }
    return;
  }
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'genos-p1-paired-'));
  const filename = path.join(root, 'paired.db');
  const db = openDatabase(filename);
  try {
    const groups = await positive(db, filename);
    await require('./helpers/pairedReplayConsumerProbes').qualify(db, groups);
    await require('./helpers/pairedReplayNegativeProbes').qualify(db);
  }
  finally { await db.close(); await fs.rm(root, { recursive: true, force: true }); }
}
if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });
module.exports = { createFork };
