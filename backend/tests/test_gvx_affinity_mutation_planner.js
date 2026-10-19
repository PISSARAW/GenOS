'use strict';

const assert = require('node:assert/strict');
const planner = require('../src/services/gvxAffinityMutationPlanner');

function accepted(diagnosis = 'false_negative') {
  return { hypothesisId: 'cause-1', diagnosis, eventRefs: ['event-1'], receipt: {
    verified: true, businessDecision: { traceId: 'trace-1' }
  }, locus: { locusId: 'route-policy', componentRef: 'router:v1', field: 'fallbackPolicy',
    currentValue: 'direct', verificationStrategy: ['inspecter trace', 'rejouer'],
    mutationPolicy: { maxEdits: 1, maxCandidates: 2, maxSerializedBytes: 64,
      allowedValues: ['fallback', 'guarded'], recipes: {
        add_counterexample: [
          { value: 'fallback', expectedEffect: 'handle the missing route' },
          { value: 'not-allowed' }, { value: { broad: true } }
        ], narrow_scope: [{ value: 'guarded' }], deepen_search: [{ value: 'guarded' }]
      } } } };
}

const report = { traceId: 'trace-1', accepted: [accepted()],
  rejected: [{ hypothesisId: 'cause-rejected', status: 'rejected', reason: 'unverified' }] };
const result = planner.plan(report, { maxCandidates: 2 });
assert.equal(result.candidates.length, 1);
assert.equal(result.candidates[0].aeisMutation, 'add_counterexample');
assert.equal(result.candidates[0].edits.length, 1);
assert.equal(result.candidates[0].edits[0].value, 'fallback');
assert.equal(result.candidates[0].editCount, 1);
assert.equal(result.candidates[0].promotionAllowed, false);
assert.equal(result.rejected.length, 1);

const falsePositive = planner.plan({ traceId: 'trace-1', accepted: [accepted('false_positive')] });
assert.equal(falsePositive.candidates[0].aeisMutation, 'narrow_scope');
assert.equal(falsePositive.candidates[0].edits[0].value, 'guarded');

const noError = planner.plan({ traceId: 'trace-1', accepted: [accepted('no_error')] });
assert.equal(noError.candidates.length, 0);
assert.equal(noError.rejected[0].reason, 'diagnosis-not-actionable');

const unbounded = accepted();
unbounded.locus.mutationPolicy.maxEdits = 2;
const refused = planner.plan({ traceId: 'trace-1', accepted: [unbounded] });
assert.equal(refused.rejected[0].reason, 'single-edit-policy-required');

assert.throws(() => planner.plan(report, { maxCandidates: 5 }), { code: 'GVX_MUTATION_BUDGET_INVALID' });
console.log('GVX bounded affinity mutation planner checks passed.');
