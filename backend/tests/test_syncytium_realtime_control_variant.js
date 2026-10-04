'use strict';

const assert = require('node:assert/strict');
const syncytium = require('../src/services/syncytiumCoordinationService');

async function verifyFailSafeWatchdog() {
  const session = await syncytium.createRealtimeControlSession('Realtime control with a fail-safe watchdog.');
  assert.equal(session.schema.schemaId, 'syncytium-realtime-control-v1');
  const result = await syncytium.checkControlWatchdog(session.sessionId, {
    actorId: 'watchdog', taskId: 'motor-control', lastHeartbeatMs: Date.now() - 1000,
    timeoutMs: 10, safeOutput: { enabled: false }
  });
  assert.equal(result.control.status, 'STOP_AND_REPAIR');
  assert.equal(result.control.reason, 'WATCHDOG_TIMEOUT');
  const state = await syncytium.snapshot(session.sessionId);
  assert.deepEqual(state.shared.sharedFields.safety_outputs['motor-control'].output, { enabled: false });
  assert.equal(state.shared.sharedFields.watchdog_log.length, 1);
  assert.equal(state.shared.sharedFields.fail_safe_log.length, 1);
}

function verifyDeadlineSchedule() {
  const result = syncytium.planControlSchedule([
    { jobId: 'slow', deadlineMs: 10, priority: 1, wcetMs: 8 },
    { jobId: 'urgent', deadlineMs: 4, priority: 1, wcetMs: 3 }
  ]);
  assert.equal(result.policy, 'EARLIEST_DEADLINE_FIRST');
  assert.deepEqual(result.schedule.map((job) => job.jobId), ['urgent', 'slow']);
  assert.equal(result.feasible, false);
  assert.equal(result.schedule[1].schedulable, false);
}

async function verifyStagedFailSafeCycle() {
  const session = await syncytium.createRealtimeControlSession('Fail safe before committing an invalid control cycle.');
  const sessionId = session.sessionId;
  await syncytium.recordWcetEvidence(sessionId, { actorId: 'daemon', taskId: 'motor', evidenceId: 'wcet-motor',
    upperBoundMs: 5, sampleCount: 20, environment: 'simulator', artifactId: 'build-1' });
  const result = await syncytium.executeControlCycle(sessionId, {
    actorId: 'worker', taskId: 'motor', wcetEvidenceId: 'wcet-motor', deadlineAtMs: Date.now() + 10000,
    operations: [{ actorId: 'worker', kind: { type: 'typed_field', key: 'controls', action: 'set', value: 'RUN' } }],
    safeOutput: { motor: 'STOP' }
  });
  assert.equal(result.control.status, 'STOP_AND_REPAIR');
  assert.deepEqual(result.control.failSafeOutput, { motor: 'STOP' });
  const snapshot = await syncytium.snapshot(sessionId);
  assert.equal(snapshot.shared.sharedFields.controls, undefined);
  assert.deepEqual(snapshot.shared.sharedFields.safety_outputs.motor.output, { motor: 'STOP' });
}

async function run() {
  await verifyFailSafeWatchdog();
  verifyDeadlineSchedule();
  await verifyStagedFailSafeCycle();
  console.log('Syncytium real-time control variant checks: PASS');
}

run().catch((error) => {  console.error(error);
  process.exitCode = 1;
});
