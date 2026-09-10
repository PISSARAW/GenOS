const assert = require('node:assert/strict');
const monitor = require('../src/services/trinityMonitorServer');

// LIKE metacharacters in a mission id must be escaped so `_` cannot act as a
// single-character wildcard and leak another mission's worlds.
assert.equal(monitor.escapeLikePattern('mission_1'), 'mission\\_1');
assert.equal(monitor.escapeLikePattern('a%b'), 'a\\%b');
assert.equal(monitor.escapeLikePattern('c\\d'), 'c\\\\d');

assert.equal(monitor.formatLogTimestamp('not-a-date'), '--:--:--');
assert.equal(monitor.formatLogTimestamp(undefined), '--:--:--');
assert.equal(typeof monitor.formatLogTimestamp(new Date().toISOString()), 'string');

(async () => {
  // Evidence must be recorded even with no connected clients (otherwise a
  // snapshot taken later reports a score of 0).
  const { instance } = monitor;
  instance.agentIndex.set('agent-evidence-test', {
    missionId: 'mission-x',
    worldNumber: 1,
    role: 'worker'
  });
  assert.equal(instance.clients.size, 0);

  await instance.handleTelemetryEvent({
    agentId: 'agent-evidence-test',
    eventType: 'EVIDENCE_REPORT',
    detail: 'evidence',
    severity: 'info',
    timestamp: new Date().toISOString(),
    payload: {}
  });

  assert.ok(
    instance.evidenceByAgent.has('agent-evidence-test'),
    'evidence must be tracked without connected clients'
  );
  instance.agentIndex.delete('agent-evidence-test');
  instance.evidenceByAgent.delete('agent-evidence-test');

  console.log('Trinity monitor escaping/evidence checks: PASS');
})().catch((error) => {
  console.error('Trinity monitor test failed:', error);
  process.exit(1);
});
