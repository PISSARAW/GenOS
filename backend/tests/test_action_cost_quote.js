'use strict';

const assert = require('node:assert/strict');
const { quoteActionCost, compareActionCosts, KINDS } = require('../src/services/actionCostQuoteService');

function cost(tokens, usd, latencyMs) {
  return { tokens, usd, latencyMs };
}

function exactAction(kind, execution) {
  return quoteActionCost({ kind, execution, verification: cost(2, 0.002, 10), maxRetries: 0 });
}

function verifyKindsAndDownstreamCosts() {
  assert.equal(KINDS.size, 8);
  for (const kind of KINDS) {
    const action = kind === 'none' || kind === 'abstain'
      ? quoteActionCost({ kind, inactionRisk: { probability: 0, impact: 1 } })
      : exactAction(kind, cost(10, 0.01, 40));
    assert.equal(action.status, 'complete', kind);
  }
  const quote = quoteActionCost({ kind: 'delegation',
    execution: cost({ min: 20, max: 30, source: 'measured' }, 0.02, 100),
    verification: cost(5, 0.005, 20), retry: cost(8, 0.008, 30), maxRetries: 2 });
  assert.deepEqual(quote.total.tokens, { min: 41, max: 51, source: 'estimated' });
  assert.equal(quote.reservationRequired.tokens, 51);
  assert.equal(quote.reservationRequired.usd, 0.041);
  assert.equal(quote.reservationRequired.latencyMs, 180);
}

function verifyUncertaintyAndProvenance() {
  const incomplete = quoteActionCost({ kind: 'tool', execution: cost(10, 0, 1) });
  assert.equal(incomplete.status, 'incomplete');
  assert.equal(incomplete.reservationRequired.tokens, null);
  assert.ok(incomplete.missing.includes('maxRetries'));
  const unknownPrice = quoteActionCost({ kind: 'small_model',
    execution: cost(10, null, 20), verification: cost(2, 0, 1), maxRetries: 0 });
  assert.equal(unknownPrice.total.tokens.max, 12);
  assert.equal(unknownPrice.total.usd.source, 'unknown');
  assert.equal(unknownPrice.reservationRequired.usd, null);
  assert.equal(quoteActionCost({ kind: 'tool', execution: cost({ min: null, max: 4 }, 0, 0),
    verification: cost(0, 0, 0), maxRetries: 0 }).total.tokens.source, 'unknown');
  const measured = quoteActionCost({ kind: 'procedure',
    execution: cost({ min: 2, max: 2, source: 'measured' },
      { min: 0, max: 0, source: 'measured' }, { min: 5, max: 5, source: 'measured' }),
    verification: cost({ min: 3, max: 3, source: 'measured' },
      { min: 0, max: 0, source: 'measured' }, { min: 7, max: 7, source: 'measured' }),
    maxRetries: 0 });
  assert.equal(measured.total.tokens.source, 'measured');
  assert.equal(measured.total.tokens.max, 5);
}

function verifyConservativeComparison() {
  const cheap = exactAction('procedure', cost(3, 0.001, 10));
  const expensive = exactAction('large_model', cost(100, 0.1, 200));
  assert.equal(compareActionCosts(cheap, expensive).relation, 'left_lower');
  assert.equal(compareActionCosts(expensive, cheap).relation, 'right_lower');
  const overlap = quoteActionCost({ kind: 'tool', execution: cost({ min: 1, max: 101 }, 0.001, 5),
    verification: cost(2, 0.002, 10), maxRetries: 0 });
  assert.equal(compareActionCosts(overlap, expensive).relation, 'incomparable');
  const tradeoff = exactAction('small_model', cost(1, 1, 300));
  assert.equal(compareActionCosts(tradeoff, expensive).reason, 'overlap_or_tradeoff');
  const missing = quoteActionCost({ kind: 'verification' });
  assert.equal(compareActionCosts(missing, cheap).relation, 'unknown');
  const abstain = quoteActionCost({ kind: 'abstain',
    inactionRisk: { probability: { min: 0.2, max: 0.4 }, impact: 1 } });
  assert.equal(abstain.inactionRisk.expectedLoss.max, 0.4);
  assert.equal(compareActionCosts(abstain, expensive).reason, 'inaction_risk_requires_value_policy');
  assert.equal(compareActionCosts(quoteActionCost({ kind: 'none' }), expensive).relation, 'unknown');
}

function verifyInvalidInputs() {
  assert.throws(() => quoteActionCost({ kind: 'magic' }), /Unsupported/);
  assert.throws(() => quoteActionCost({ kind: 'tool', maxRetries: -1 }), /maxRetries/);
  assert.throws(() => quoteActionCost({ kind: 'tool', maxRetries: 1.5 }), /maxRetries/);
  assert.throws(() => quoteActionCost({ kind: 'tool', execution: cost(-1, 0, 0) }), /finite bounds/);
  assert.throws(() => quoteActionCost({ kind: 'tool', execution: cost({ min: 9, max: 2 }, 0, 0) }), /finite bounds/);
  assert.throws(() => quoteActionCost({ kind: 'none',
    inactionRisk: { probability: 1.1, impact: 1 } }), /\[0, 1\]/);
}

verifyKindsAndDownstreamCosts();
verifyUncertaintyAndProvenance();
verifyConservativeComparison();
verifyInvalidInputs();
console.log('Action cost quote tests passed.');
