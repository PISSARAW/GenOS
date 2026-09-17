'use strict';

const assert = require('node:assert/strict');
const comparisonService = require('../src/services/ethicalComparisonService');
const { buildStrategyContract } = require('../src/services/strategyContractService');
const { evaluatePromotionGate } = require('../src/services/strategyPromotionPolicyService');
const memoryStore = require('../src/services/agentMemoryStore');

const comparison = comparisonService.compareEthicalFrameworks({
  scenario: { action: { id: 'allocate-care' } },
  frameworks: ['utilitarianism', 'deontology'],
  evidenceRefs: ['evidence:clinical-trial-1'],
  assumptions: ['outcomes are independently estimated']
});
const contract = buildStrategyContract({ problem: 'Assess a high impact care decision.', ethicalComparison: comparison });
assert.equal(contract.ethical_comparison.promotion.interpretationStatus, 'interpretive');
assert.equal(contract.promotion.require_ethical_review, true);

const baseContext = { replayVerified: true, independentVerification: true };
const blocked = evaluatePromotionGate(contract, baseContext);
assert.ok(blocked.violations.some((violation) => violation.policy === 'ethical_comparison_interpretation'));

const reviewed = evaluatePromotionGate(contract, {
  ...baseContext,
  ethicalReview: { status: 'approved', provenanceVerified: true, evidenceVerified: true }
});
assert.equal(reviewed.eligible, true);

const memory = memoryStore.buildMemoryRecord({
  agentId: 'worker-1',
  task: 'compare care decision',
  summary: 'Comparison retained for review.',
  options: { claims: [], ethicalComparison: contract.ethical_comparison }
});
assert.equal(memory.category, 'InterpretiveExperience');
assert.match(memory.content, /ETHICAL_COMPARISON/);
assert.equal(memory.ethicalInterpretive, true);

console.log('Ethical promotion integration tests passed.');
