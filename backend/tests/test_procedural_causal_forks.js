'use strict';

const assert = require('node:assert/strict');
const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const causal = require('../src/services/proceduralCausalExperimentService');

async function main() {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  const experiment = await causal.createExperiment(db, {
    protocolVersion: 'v1', runnerId: 'test', environmentId: 'test',
    environmentManifest: { version: 1 }, snapshots: [{ snapshotId: 's', state: { step: 0 } }],
    arms: { control: { id: 'a' }, intervention: { id: 'b' } }, seeds: [7],
    budget: { maxSteps: 3, maxRuns: 2 }, analysis: { method: 'paired' },
  });
  const fork = await causal.createFork(db, { experimentId: experiment.experimentId,
    snapshotId: 's', arm: 'control', seed: 7 });
  await db.run("UPDATE procedural_causal_forks SET status = 'running', lease_token = 'owner' WHERE fork_id = ?", [fork.forkId]);
  const saved = await causal.checkpointFork(db, { forkId: fork.forkId, expectedVersion: 0,
    leaseToken: 'owner', state: { step: 1 }, status: 'running' });
  assert.equal(saved.checkpointVersion, 1);
  assert.deepEqual((await causal.loadFork(db, fork.forkId)).state, { step: 1 });
  await assert.rejects(causal.checkpointFork(db, { forkId: fork.forkId, expectedVersion: 1,
    leaseToken: 'stale', state: { step: 2 }, status: 'running' }), /CAUSAL_FORK_LEASE_CONFLICT/);
  await db.run("UPDATE procedural_causal_fork_events SET payload_json = '{}' WHERE fork_id = ? AND event_type = 'CHECKPOINT'", [fork.forkId]);
  await assert.rejects(causal.loadFork(db, fork.forkId), /CAUSAL_FORK_EVENT_CORRUPT/);
  await db.close();
}

main().then(() => console.log('Durable causal fork checkpoint and event integrity passed.')).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
