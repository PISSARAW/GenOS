'use strict';

const assert = require('node:assert/strict');
const fixture = require('../fixtures/pairedReplayRunner.cjs');
const experiments = require('../../src/services/proceduralCausalExperimentService');
const replay = require('../../src/services/proceduralCausalReplayService');
const registry = require('../../src/services/proceduralRegistryService');
const protocol = require('../../src/services/pairedReplayProtocol');

async function fork(db, name, change = () => {}) {
  const spec = fixture.spec(`negative-${name}`);
  change(spec);
  await experiments.createExperiment(db, spec);
  const created = await experiments.createFork(db, { experimentId: spec.experimentId,
    snapshotId: 'paired-snapshot', arm: 'control', seed: 7, scope: fixture.scope });
  return { created, spec };
}

async function admission(db) {
  const duplicate = fixture.spec('duplicate-events');
  duplicate.replayContract.events.push(duplicate.replayContract.events[0]);
  await assert.rejects(experiments.createExperiment(db, duplicate), { code: 'CAUSAL_REPLAY_EVENT_DUPLICATE' });
  const wrong = fixture.spec('wrong-environment');
  wrong.environmentManifest = { version: 'invented' };
  await assert.rejects(experiments.createExperiment(db, wrong), { code: 'CAUSAL_ENV_DRIFT' });
  const valid = await fork(db, 'scope');
  await assert.rejects(experiments.createFork(db, { experimentId: valid.spec.experimentId,
    snapshotId: 'paired-snapshot', arm: 'intervention', seed: 7, scope: { ...fixture.scope, entityId: 'other' } }), { code: 'CAUSAL_REPLAY_SCOPE_MISMATCH' });
}

async function drift(db) {
  const { created } = await fork(db, 'runner');
  let invoked = false;
  registry.registerRunner('paired-runner', async () => { invoked = true; return { metric: 99 }; });
  try { await assert.rejects(replay.replayFork(db, fixture.replayInput(created.forkId)), { code: 'CAUSAL_RUNNER_DRIFT' }); }
  finally { fixture.register(); }
  assert.equal(invoked, false);
  assert.equal((await experiments.loadFork(db, created.forkId)).status, 'pending');
  const environment = await fork(db, 'environment');
  registry.registerEnvironment('paired-environment', { revision: 'changed' });
  try { await assert.rejects(replay.replayFork(db, fixture.replayInput(environment.created.forkId)), { code: 'CAUSAL_ENV_DRIFT' }); }
  finally { fixture.register(); }
}

async function invalidRuntime(db) {
  for (const [property, error] of [['invalidAddress', 'CAUSAL_RANDOM_ADDRESS_INVALID'], ['invalidSlot', 'CAUSAL_RANDOM_ADDRESS_INVALID'], ['replaceRunner', 'CAUSAL_RUNNER_DRIFT']]) {
    const { created } = await fork(db, property, spec => { spec.arms.control[property] = true; });
    try { await assert.rejects(replay.replayFork(db, fixture.replayInput(created.forkId)), { code: error }); }
    finally { fixture.register(); }
    const saved = await experiments.loadFork(db, created.forkId);
    assert.equal(saved.status, 'failed');
    assert.equal(saved.events.filter(event => event.event_type === 'RUN_RESULT').length, 0);
  }
  const mutable = await fork(db, 'immutable', spec => { spec.arms.control.mutateEvents = true; });
  await assert.rejects(replay.replayFork(db, fixture.replayInput(mutable.created.forkId)), TypeError);
  assert.equal(fixture.spec().replayContract.events[0].payload.amount, 1);
}

async function protocolSwap(db) {
  const { created, spec } = await fork(db, 'swap');
  spec.replayContract.events[0].payload.amount = 50;
  const changed = protocol.create(spec);
  await db.run('UPDATE procedural_causal_experiments SET replay_contract_json=?, replay_protocol_hash=? WHERE experiment_id=?', changed.contract, changed.hash, spec.experimentId);
  await assert.rejects(replay.replayFork(db, fixture.replayInput(created.forkId)), { code: 'CAUSAL_REPLAY_FORK_BINDING_INVALID' });
  const downgrade = await fork(db, 'downgrade');
  await db.run("UPDATE procedural_causal_experiments SET protocol_version='v1', replay_contract_json=NULL, replay_protocol_hash=NULL WHERE experiment_id=?", downgrade.spec.experimentId);
  await assert.rejects(replay.replayFork(db, fixture.replayInput(downgrade.created.forkId)), { code: 'CAUSAL_REPLAY_VERSION_MISMATCH' });
}

async function stateSwap(db) {
  const { created } = await fork(db, 'state');
  const wrong = { cursor: 1, value: 100, trajectory: [] };
  await db.run('UPDATE procedural_causal_forks SET state_json=?, state_hash=? WHERE fork_id=?', JSON.stringify(wrong), experiments.digest(wrong), created.forkId);
  await assert.rejects(replay.replayFork(db, fixture.replayInput(created.forkId)), { code: 'CAUSAL_REPLAY_STATE_BINDING_INVALID' });
  registry.registerRunner('opaque-runner', fixture.runner.bind(null));
  const opaque = fixture.spec('opaque-source');
  opaque.runnerId = 'opaque-runner';
  try { await assert.rejects(experiments.createExperiment(db, opaque), { code: 'CAUSAL_RUNNER_SOURCE_UNAVAILABLE' }); }
  finally { registry.unregisterRunner('opaque-runner'); }
}

async function changedDuringRun(db) {
  const { created, spec } = await fork(db, 'live-protocol');
  const original = db.exec;
  let changed = false;
  db.exec = async sql => {
    const result = await original(sql);
    if (!changed && sql === 'COMMIT') {
      changed = true;
      await db.run('UPDATE procedural_causal_experiments SET analysis_json=? WHERE experiment_id=?', JSON.stringify({ changed: true }), spec.experimentId);
    }
    return result;
  };
  try { await assert.rejects(replay.replayFork(db, fixture.replayInput(created.forkId)), { code: 'CAUSAL_REPLAY_PROTOCOL_CHANGED' }); }
  finally { db.exec = original; }
  assert.equal(changed, true);
  const saved = await experiments.loadFork(db, created.forkId);
  assert.equal(saved.status, 'failed');
  assert.equal(saved.state.cursor, 1);
  assert.equal(saved.events.filter(event => event.event_type === 'RUN_RESULT').length, 0);
}

async function unusedRandomness(db) {
  const ignored = async arm => ({ metric: arm.delta, trajectory: [] });
  registry.registerRunner('ignored-randomness', ignored);
  const spec = fixture.spec('unused-randomness');
  spec.runnerId = 'ignored-randomness';
  try {
    await experiments.createExperiment(db, spec);
    const forks = [];
    for (const arm of ['control', 'intervention']) {
      const fork = await experiments.createFork(db, { experimentId: spec.experimentId,
        snapshotId: 'paired-snapshot', scope: fixture.scope, arm, seed: 7 });
      await replay.replayFork(db, { ...fixture.replayInput(fork.forkId), runnerId: spec.runnerId, runner: ignored });
      forks.push(fork.forkId);
    }
    await assert.rejects(replay.causalDiff(db, { baselineForkId: forks[0], interventionForkId: forks[1], scope: fixture.scope }),
      { code: 'CAUSAL_PAIRED_RANDOMNESS_UNOBSERVED' });
  } finally { registry.unregisterRunner('ignored-randomness'); }
  console.log('Completed forks with a declared random protocol but no shared observed draw remain unqualified.');
}

async function falseObservation(db) {
  const rows = await db.all("SELECT fork_id,arm FROM procedural_causal_forks WHERE experiment_id='p1-addressed-replay' AND seed=7");
  const baseline = rows.find(row => row.arm === 'control');
  const candidate = rows.find(row => row.arm === 'intervention');
  const saved = await experiments.loadFork(db, baseline.fork_id);
  const payload = structuredClone(saved.events.at(-1).payload);
  payload.replayObservation.samples[0].value = 0.99;
  await experiments.recordEvent(db, { forkId: baseline.fork_id, eventType: 'RUN_RESULT',
    stateHash: experiments.digest(payload.result), payload });
  await experiments.loadFork(db, baseline.fork_id);
  await assert.rejects(replay.causalDiff(db, { baselineForkId: baseline.fork_id, interventionForkId: candidate.fork_id,
    scope: fixture.scope }), { code: 'CAUSAL_RANDOMNESS_PROOF_INVALID' });
  await require('./pairedReplayConsumerProbes').stale(db);
  console.log('A valid hash chain with a false random observation cannot establish paired controls.');
}

async function qualify(db) {
  await admission(db);
  await drift(db);
  await invalidRuntime(db);
  await protocolSwap(db);
  await stateSwap(db);
  await changedDuringRun(db);
  await unusedRandomness(db);
  await require('./pairedReplayConcurrencyProbe').qualify(db);
  await falseObservation(db);
  console.log('Paired replay negatives: scope, actual runner and environment drift, random addresses, immutable events, protocol substitution and downgrade refused.');
}

module.exports = { qualify, fork };
