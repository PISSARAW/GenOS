const assert = require('node:assert/strict');
const state = require('../src/services/agentOrchestrationState');

// Positional form used across the orchestration services:
// emit(agentId, eventType, action, detail, payload, severity, status)
const positional = state.emit('agent-1', 'EVT', 'ACT', 'detail', { foo: 1 }, 'warning', 'blocked');
assert.equal(positional.severity, 'warning', 'positional severity must be honored');
assert.equal(positional.status, 'blocked', 'positional status must be honored');
assert.equal(positional.payload.foo, 1, 'positional payload must not be dropped');

// Options form: emit(agentId, eventType, action, detail, { payload, severity, status })
const optionsStyle = state.emit('agent-1', 'EVT2', 'ACT2', 'detail', {
  payload: { bar: 2 },
  severity: 'critical',
  status: 'error'
});
assert.equal(optionsStyle.severity, 'critical');
assert.equal(optionsStyle.status, 'error');
assert.equal(optionsStyle.payload.bar, 2);

const defaultStyle = state.emit('agent-1', 'EVT3', 'ACT3', 'detail', { baz: 3 });
assert.equal(defaultStyle.severity, 'info');
assert.equal(defaultStyle.payload.baz, 3);

console.log('Emit signature contract: PASS');
