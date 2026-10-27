'use strict';

const assert = require('node:assert/strict');
const advisor = require('../src/services/agow/allostaticMorphogenesisProposalService');
const adapter = require('../src/services/agow/markets/morphogenesisMarketAdapter');

const measured = { status: 'measured', variables: { inefficiency: 0.82, recommendedTopology: 'trinity' },
  evidenceRefs: ['worker-outcome:17'] };
assert.equal(advisor.recommendation({ agent: measured }), null,
  'an individual agent need cannot authorize collective morphology advice');
assert.equal(advisor.recommendation({ mission: { ...measured, evidenceRefs: [] } }), null,
  'a diagnostic without evidence cannot propose a morphology');
const recommendation = advisor.recommendation({ mission: measured });
assert.equal(recommendation.topology, 'trinity');
const proposal = adapter.normalizeProposal({ proposal: { proposalId: 'agow-allostatic:frame-1:mission',
  topology: recommendation.topology, evidenceRefs: recommendation.evidenceRefs,
  diagnosis: { kind: 'allostatic_collective_inefficiency', scope: recommendation.scope,
    inefficiency: recommendation.inefficiency, frameId: 'frame-1' } } });
assert.equal(proposal.status, 'shadow');
assert.equal(proposal.diagnosis.scope, 'mission');
assert.equal(adapter.normalizeProposal({ proposal: { proposalId: 'bad', topology: 'unknown',
  evidenceRefs: ['worker-outcome:17'] } }), null);
console.log('✅ AGOW collective allostatic morphology proposal gates passed');
