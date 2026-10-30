'use strict';

const assert = require('node:assert/strict');
const { estimatePromptTokens, resolveMaxOutputTokens, throwIfConsumedOverBudget } = require('../src/services/workerEvidenceBarrierLocalBudget');

const measuredRt27PromptEstimate = 2285;
const rt27Budget = 2333;
const rt27Prompt = 'x'.repeat(measuredRt27PromptEstimate * 4);
assert.equal(estimatePromptTokens(rt27Prompt), measuredRt27PromptEstimate);
assert.equal(rt27Budget - estimatePromptTokens(rt27Prompt), 48,
  'The captured rt27 allocation left only 48 tokens for output.');
assert.equal(resolveMaxOutputTokens(rt27Budget, rt27Prompt), 48,
  'Structured output cannot exceed the estimated remaining token budget.');
assert.equal(resolveMaxOutputTokens(10000, 'x'.repeat(4000)), 9000,
  'Roomy allocations retain their full estimated output headroom.');
assert.equal(resolveMaxOutputTokens(7000, 'x'.repeat(1000), 768), 768,
  'Role-specific output caps keep structured allocation reports bounded.');
assert.equal(resolveMaxOutputTokens(128, 'x'), 127,
  'The completion reserve never exceeds the total worker budget.');
assert.equal(resolveMaxOutputTokens(0, 'x'), undefined,
  'Unbounded missions keep provider-default output behavior.');
assert.throws(() => resolveMaxOutputTokens(2564, 'x'.repeat(2564 * 4)), { code: 'BUDGET_EXHAUSTED' });
assert.throws(() => throwIfConsumedOverBudget(2400, rt27Budget), { code: 'BUDGET_EXHAUSTED' },
  'Measured usage above the worker budget is still rejected after generation.');

console.log('Local worker output reserve and measured budget guard: PASS');
