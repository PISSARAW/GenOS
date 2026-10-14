'use strict';

const assert = require('node:assert/strict');
const events = require('../bin/agent-runtime-events.cjs');

assert.equal(events.budgetLimit({ executionBudget: {} }, 'tokens'), 100000,
  'missing dimensions use the bounded mission defaults');
assert.equal(events.budgetLimit({ executionBudget: {} }, 'latencyMs'), 60000);
assert.equal(events.budgetLimit({ executionBudget: { tokens: 0 } }, 'tokens'), 0,
  'a zero token budget remains a zero ceiling for deterministic workers');
assert.equal(events.budgetLimit({ executionBudget: { tokens: 'invalid' } }, 'tokens'), 0,
  'an invalid explicit budget fails closed');
assert.equal(events.budgetLimit({ executionBudget: { events: Infinity } }, 'events'), 0,
  'an unbounded numeric value fails closed');

function runtimeState(tokenLimit) {
  const emitted = [];
  return {
    executionBudget: { tokens: tokenLimit },
    eventCount: 0,
    exactTokens: 0,
    estimatedTokens: 100,
    observedCostUsd: 0,
    budgetStopped: null,
    emitted,
    emit: (event) => emitted.push(event),
    child: { stdout: { pause() {} }, stderr: { pause() {} }, kill() {} },
    requiredTools: new Set(),
    observedTools: new Set(),
    recordedTurns: [],
    mission: { prompt: 'Test billable token accounting' },
    conscienceState: { dissonanceLevel: 0, currentBudget: 100 },
    pendingConscienceOp: Promise.resolve(),
    db: null,
    hasAgentInDb: false
  };
}

assert.equal(events.billableTokenCount({
  input_tokens: 300_000,
  cached_input_tokens: 295_000,
  output_tokens: 1_000,
  total_tokens: 301_000
}), 6_000);
assert.equal(events.billableTokenCount({ input_tokens: 300_000, cached_input_tokens: 'malformed',
  output_tokens: 1_000, total_tokens: 301_000 }), 301_000,
'invalid cache split must use a valid conservative total');
assert.equal(events.billableTokenCount({ input_tokens: 10_000, total_tokens: 10_100 }), 10_100,
  'partial input/output splits must use the valid total');
assert.equal(events.billableTokenCount({ input_tokens: 10_000, cached_input_tokens: 'malformed' }), null,
  'unusable usage without a valid total must fail closed');

const withinBudget = runtimeState(8_000);
events.handleParsedEvent(withinBudget, { type: 'turn.completed', usage: {
  input_tokens: 300_000, cached_input_tokens: 295_000, output_tokens: 1_000, total_tokens: 301_000
} });
assert.equal(withinBudget.exactTokens, 6_000);
assert.equal(withinBudget.budgetStopped, null);
assert.equal(withinBudget.emitted[0].action, 'VERIFY');

const exhausted = runtimeState(8_000);
events.handleParsedEvent(exhausted, { type: 'turn.completed', usage: {
  input_tokens: 10_000, cached_input_tokens: 0, output_tokens: 1_000, total_tokens: 11_000
} });
assert.equal(exhausted.exactTokens, 11_000);
assert.equal(exhausted.budgetStopped.dimension, 'tokens');
assert.deepEqual(exhausted.emitted.map((event) => event.eventType), ['AGENT_STEP', 'BUDGET_EXHAUSTED']);
assert.equal(exhausted.emitted[0].payload.usage.total_tokens, 11_000,
  'the terminal usage event is emitted before the budget guard stops the runtime');

const unknownUsage = runtimeState(8_000);
events.handleParsedEvent(unknownUsage, { type: 'turn.completed', usage: {
  input_tokens: 10_000, cached_input_tokens: 'malformed'
} });
assert.equal(unknownUsage.budgetStopped.dimension, 'tokens');
assert.equal(unknownUsage.budgetStopped.observed, 'unknown');

console.log('Runtime billable budget accounting: PASS');
