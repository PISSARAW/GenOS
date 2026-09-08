const assert = require('node:assert/strict');
const strategy = require('../src/services/strategyExecutionService');

assert.equal(strategy.primitiveFailureReason({ stage_key: 'snapshot' }, { success: true }), null);
assert.match(
  strategy.primitiveFailureReason({ stage_key: 'snapshot' }, { success: false, error: 'workspaceId required' }),
  /snapshot.*workspaceId required/
);

// Test resolveStagePrimitives: contracted portfolio primitives
const portfolioWithStdp = [{ id: 'stdp_plasticity', primitives: ['stdp_update', 'cherry_pick_golden_path'] }];
const matched = strategy.resolveStagePrimitives('conditional_promotion', portfolioWithStdp);
assert.deepEqual(matched, ['stdp_update', 'cherry_pick_golden_path']);

// Test resolveStagePrimitives: uncontracted portfolio allows graceful pass-through (returns [])
const portfolioWithoutStdp = [{ id: 'deterministic_direct_path', primitives: ['search_memory', 'run'] }];
const uncontracted = strategy.resolveStagePrimitives('conditional_promotion', portfolioWithoutStdp);
assert.deepEqual(uncontracted, [], 'Should return empty array to allow pass-through without executing uncontracted primitives');

// Test resolveStagePrimitives: strict mode throws when required
assert.throws(
  () => strategy.resolveStagePrimitives('conditional_promotion', portfolioWithoutStdp, { strict: true }),
  (err) => err.code === 'STRATEGY_PORTFOLIO_UNSUPPORTED_STAGE'
);

console.log('✅ Strategy primitive gates and stage resolution pass all tests.');