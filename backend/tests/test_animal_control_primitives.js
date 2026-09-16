const assert = require('node:assert/strict');
const adapter = require('../src/services/strategyExecutionAdapter');
const { listStrategies } = require('../src/strategies/strategyRegistry');

(async () => {
  const strategies = listStrategies().filter((strategy) => strategy.family === 'animal_control');
  assert.equal(strategies.length, 12);
  assert(strategies.every((strategy) => strategy.executionStatus === 'ready'));

  const echo = await adapter.executePrimitive('probe_system', {
    target: 'backend/tests',
    confidence: 0.62,
    evidence: ['response_trace:test']
  });
  assert.equal(echo.success, true);
  assert.equal(echo.capability, 'FOVEAL_PERCEPTION');
  assert.deepEqual(echo.controlLoop, ['stimulus', 'internal_state', 'decision', 'action', 'feedback', 'evidence']);
  assert.equal(echo.output.confidence, 0.62);

  const inert = await adapter.executePrimitive('reduce_attack_surface', {
    stimulus: 'suspect worker',
    confidence: 2
  });
  assert.equal(inert.success, true);
  assert.equal(inert.output.confidence, 1);
  assert(inert.guardrails.includes('internal_sandbox_only'));
  assert(inert.guardrails.includes('no_user_deception'));

  const unknown = await adapter.executePrimitive('unknown_animal_reflex', {});
  assert.equal(unknown.success, false);
  assert.equal(unknown.code, 'STRATEGY_PRIMITIVE_UNIMPLEMENTED');
  console.log('Animal control primitive checks passed.');
})().catch((error) => { console.error(error); process.exitCode = 1; });