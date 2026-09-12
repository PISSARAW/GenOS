const assert = require('node:assert/strict');
const budget = require('../src/services/strategyAdaptationBudget');

// Exhausted budget blocks normal changes but the approved fallback path
// carries its own flag; the cooldown prevents flap loops.
assert.equal(budget.isBudgetExhausted({ tokens: 10, costUsd: 1, latencyMs: 5, events: 2 }), false);
assert.equal(budget.isBudgetExhausted({ tokens: 0, costUsd: 1, latencyMs: 5, events: 2 }), true);
assert.equal(budget.isBudgetExhausted(null), false);

const first = budget.checkFallbackCooldown('orch-fallback-test', 1000);
assert.equal(first.allowed, true);
const second = budget.checkFallbackCooldown('orch-fallback-test', 2000);
assert.equal(second.allowed, false);
assert.ok(second.retryAfterMs > 0);
const later = budget.checkFallbackCooldown('orch-fallback-test', 1000 + budget.FALLBACK_COOLDOWN_MS + 1);
assert.equal(later.allowed, true);

console.log('Strategy adaptation fallback budget checks passed.');
