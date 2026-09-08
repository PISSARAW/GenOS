const assert = require('node:assert/strict');
const adapter = require('../src/services/strategyExecutionAdapter');

(async () => {
  const denied = await adapter.executePrimitive('uncertainty_gate', { uncertainty: 0.9, threshold: 0.5 });
  assert.equal(denied.allowed, false);
  const refusal = await adapter.executePrimitive('active_refusal', { uncertainty: 0.9, threshold: 0.5 });
  assert.equal(refusal.refused, true);
  const passed = await adapter.executePrimitive('uncertainty_gate', { uncertainty: 0.2, threshold: 0.5 });
  assert.equal(passed.allowed, true);
  const drift = await adapter.executePrimitive('drift_threshold', { actionHistory: ['a', 'a', 'a', 'b'], threshold: 0.5 });
  assert.equal(drift.success, true);
  console.log('Strategy governance primitive checks passed.');
})().catch((error) => { console.error(error); process.exitCode = 1; });