'use strict';

const assert = require('node:assert/strict');
const syncytium = require('../src/services/syncytiumCoordinationService');
const { CYCLE_STAGES } = require('../src/services/syncytium/runtime/syncytiumTick');

async function main() {
  const session = await syncytium.createSession('Event-driven autonomous Syncytium.', {
    schema: { fields: { status: { dataType: 'LEGACY_LWW' }, release: { dataType: 'LEGACY_LWW' } } }
  });
  const runtime = syncytium.createAutonomousRuntime({ snapshotEvery: 1, compactEvery: 1 });
  assert.equal(runtime.mode, 'EVENT_DRIVEN');

  const first = await runtime.receive(session.sessionId, {
    operation: { opId: 'runtime-status', actorId: 'worker', kind: { type: 'set_field', key: 'status', value: 'ready' } }
  });
  assert.equal(first.snapshot.shared.sharedFields.status, 'ready');
  assert.equal(first.repair.required, false);
  assert.equal(first.materialization.snapshot.stateVersion, 1);
  assert.equal(first.materialization.compaction.compacted, 1);
  assert.deepEqual(first.cycle, CYCLE_STAGES);
  assert.equal(first.eventDriven, true);

  const batch = await runtime.receive(session.sessionId, {
    txId: 'runtime-release', operations: [
      { opId: 'runtime-release-status', actorId: 'worker', kind: { type: 'set_field', key: 'release', value: 'v5' } },
      { opId: 'runtime-release-marker', actorId: 'worker', kind: { type: 'set_field', key: 'status', value: 'released' } }
    ]
  });
  assert.equal(batch.result.txId, 'runtime-release');
  assert.equal(batch.snapshot.shared.sharedFields.release, 'v5');
  assert.equal(batch.result.snapshot.logSize, 3);
  assert.equal((await syncytium.listSnapshots(session.sessionId)).length, 4);

  const beforeInvalidEvent = (await syncytium.snapshot(session.sessionId)).shared.logSize;
  await assert.rejects(() => runtime.receive(session.sessionId, {
    snapshotEvery: -1,
    operation: { opId: 'runtime-invalid-interval', actorId: 'worker', kind: { type: 'set_field', key: 'status', value: 'bad' } }
  }), (error) => error.code === 'SYNCYTIUM_RUNTIME_INTERVAL_INVALID');
  assert.equal((await syncytium.snapshot(session.sessionId)).shared.logSize, beforeInvalidEvent);
  await assert.rejects(() => runtime.receive(session.sessionId, {}),
    (error) => error.code === 'SYNCYTIUM_RUNTIME_EVENT_INVALID');
  assert.equal((await runtime.inspect(session.sessionId)).required, false);
  const manualSnapshot = await runtime.materialize(session.sessionId);
  assert.equal(manualSnapshot.snapshot.shared.sharedFields.status, 'released');
}

main().then(() => console.log('Syncytium autonomous runtime checks: PASS')).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
