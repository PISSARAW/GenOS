const assert = require('node:assert/strict');
const telemetry = require('../src/services/telemetryObserver');

const event = telemetry.emitEvent({
  eventType: 'REPLAY_TEST_EVENT',
  agentId: 'agent-replay-test',
  payload: { executionRunId: 'run-replay-test' }
});

assert.equal(event.sessionId, 'run-replay-test');
assert.equal(event.payload.sessionId, undefined);

const standalone = telemetry.emitEvent({ eventType: 'REPLAY_TEST_EVENT', agentId: 'agent-replay-test', payload: {} });
assert.equal(standalone.sessionId, 'agent-session-agent-replay-test');

console.log('Session telemetry identity: PASS');