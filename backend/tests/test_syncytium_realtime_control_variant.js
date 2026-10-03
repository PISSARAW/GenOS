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

async function run() {
  await verifyFailSafeWatchdog();
  verifyDeadlineSchedule();
  console.log('Syncytium real-time control variant checks: PASS');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
