const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const telemetry = require('../src/services/telemetryObserver');
const fanout = require('../src/services/telemetryFanout');

// Server timestamp is imposed: a stale client timestamp is overwritten.
const stale = telemetry.emitEvent({ eventType: 'CONTRACT_CHECK', agentId: 'contract', timestamp: '2020-01-01T00:00:00.000Z' });
assert.ok(!stale.timestamp.startsWith('2020'), 'stale client timestamp must be overwritten by server time');

// A fresh client timestamp (within tolerance) is preserved.
const now = new Date().toISOString();
const kept = telemetry.emitEvent({ eventType: 'CONTRACT_CHECK', agentId: 'contract', timestamp: now });
assert.equal(kept.timestamp, now);

// Event types outside ^[A-Z][A-Z0-9_]{2,64}$ are rejected.
function expectInvalidEventType(raw) {
  try {
    telemetry.emitEvent({ eventType: raw });
  } catch (error) {
    assert.equal(error.code, 'INVALID_TELEMETRY_EVENT');
    return;
  }
  assert.fail(`eventType '${raw}' must be rejected`);
}
expectInvalidEventType('bad-lower');
expectInvalidEventType('X');

// A throwing listener cannot break fanout nor skip webhook dispatch.
const emitter = new EventEmitter();
let boomCalled = false;
emitter.on('telemetry', () => { boomCalled = true; throw new Error('boom'); });
const dispatched = [];
fanout.fanout(emitter, { dispatch: (event) => dispatched.push(event) }, { id: 'contract-event' });
assert.equal(boomCalled, true);
assert.equal(dispatched.length, 1);

// Observer level: a throwing 'telemetry' listener must not break emitEvent.
telemetry.on('telemetry', () => { throw new Error('observer-boom'); });
const survived = telemetry.emitEvent({ eventType: 'CONTRACT_CHECK', agentId: 'contract' });
assert.ok(survived.id);
telemetry.removeAllListeners('telemetry');
telemetry.persistQueue.length = 0;

console.log('Telemetry contract checks: PASS');
