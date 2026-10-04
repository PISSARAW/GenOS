'use strict';

const assert = require('node:assert/strict');
const syncytium = require('../src/services/syncytiumCoordinationService');

async function main() {
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
  console.log('Syncytium real-time staging and fail-safe checks: PASS');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
