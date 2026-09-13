const assert = require('node:assert/strict');
const { primitiveFailureReason } = require('../src/services/strategyExecutionEvents');

const step = { stage_key: 'snapshot' };

assert.equal(primitiveFailureReason(step, { success: true, results: [] }), null);
assert.equal(primitiveFailureReason(step, null), null);

// The real cause must surface from the failed primitive inside the wrapper.
const nested = primitiveFailureReason(step, {
  success: false,
  results: [
    { primitive: 'snapshot', result: { success: false, error: "Workspace 'ws-x' not found." } },
    { primitive: 'adaptation_feedback', result: { success: true } }
  ]
});
assert.match(nested, /Workspace 'ws-x' not found\./);
assert.equal(nested.endsWith('..'), false, 'the message must not double the final period');

const codeOnly = primitiveFailureReason(step, {
  success: false,
  results: [{ primitive: 'run', result: { success: false, code: 'STRATEGY_PRIMITIVE_UNIMPLEMENTED' } }]
});
assert.match(codeOnly, /STRATEGY_PRIMITIVE_UNIMPLEMENTED/);

const primitiveOnly = primitiveFailureReason(step, {
  success: false,
  results: [{ primitive: 'vfs_dry_run', result: { success: false } }]
});
assert.match(primitiveOnly, /vfs_dry_run/);

const generic = primitiveFailureReason(step, { success: false, results: [] });
assert.equal(generic, "Phase 'snapshot' gate failed: strategy primitive failed.");

const direct = primitiveFailureReason(step, { success: false, error: 'direct failure' });
assert.match(direct, /direct failure/);

console.log('Primitive failure reasons surface the real cause instead of a generic message.');
