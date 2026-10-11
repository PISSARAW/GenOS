'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { enforceRequiredVariantGates } = require('../src/services/trinityComparisonRuntime');

function resultFor(status, reason) {
  return enforceRequiredVariantGates({
    input: { variantSelection: { experimentalDesign: { worldTopology: 'recursive_nesting' }, requiredAdapters: [] } },
    result: { canMerge: true, outcome: 'PROMOTE_WORLD', selectedWorld: 1, mergedEvidence: {}, comparativeAnalysis: {} },
    recursiveReview: { status, reason }, variantExecution: { executions: {} }, worlds: []
  });
}

test('A recursion stop cannot satisfy the recursive variant gate', () => {
  for (const reason of ['max_depth_reached', 'budget_exhausted', 'marginal_cost_below_threshold', 'cycle_detected']) {
    const result = resultFor('recursion_blocked', reason);
    assert.equal(result.outcome, 'ESCALATE_EXPERIMENT');
    assert.equal(result.canMerge, false);
  }
  assert.equal(resultFor('verified').canMerge, true);
  assert.equal(resultFor('no_subproblem').canMerge, true);
});
