'use strict';

const assert = require('node:assert/strict');
const { buildStrategyContract } = require('../src/services/strategyContractService');
const { evaluatePromotionGate } = require('../src/services/strategyPromotionPolicyService');
const { buildMemoryRecord, memoryContent } = require('../src/services/agentMemoryStore');

const analyses = [{
  analysisId: 'analysis-gettier-1',
  conceptId: 'epistemology.gettier-problem',
  result: { status: 'disputed', conclusion: 'The claim is Gettierized.' },
  provenance: { version: '1.0.0', sourceType: 'genos', sourceDocument: 'docs/01-concepts/savoir-et-epistemologie.md' }
}];

const contract = buildStrategyContract({
  problem: 'Assess a decision before promotion',
  epistemicAnalyses: analyses
});

assert.equal(contract.epistemic_context.interpretive, true);
assert.equal(contract.epistemic_context.provenanceComplete, true);
assert.equal(contract.promotion.epistemic_hold, true);
assert.equal(contract.promotion.require_epistemic_verification, true);
assert.equal(contract.promotion.require_epistemic_provenance, true);

const blocked = evaluatePromotionGate(contract, {});
assert.equal(blocked.eligible, false);
assert.ok(blocked.violations.some((item) => item.policy === 'epistemic_analysis_verification'));

const evidenceOnly = { epistemicEvidenceVerified: true, independentVerification: true };
const assemblyMissing = evaluatePromotionGate(contract, evidenceOnly);
assert.equal(assemblyMissing.eligible, false);
assert.ok(assemblyMissing.violations.some((item) => item.policy === "require_epistemic_assurance"));
const epistemicDecision = require('../src/services/epistemicDecisionService');
assert.deepEqual(epistemicDecision.evaluatePromotionContext(contract, evidenceOnly), []);

const record = buildMemoryRecord({
  agentId: 'worker-epistemic',
  task: 'Assess a decision',
  summary: 'The result remains interpretive.',
  options: { epistemicContext: contract.epistemic_context, claims: [] }
});
assert.equal(record.category, 'InterpretiveExperience');
assert.equal(record.epistemicInterpretive, true);
assert.match(memoryContent({
  task: 'Assess a decision',
  summary: 'The result remains interpretive.',
  options: { epistemicContext: contract.epistemic_context }
}, { raw: [] }, false), /EPISTEMIC_ANALYSIS/);

console.log('Epistemic analysis verified; promotion still requires an assembly; worker memory integration: PASS');
