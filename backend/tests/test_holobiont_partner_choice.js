'use strict';

const assert = require('assert');
const { rankCandidates } = require('../src/services/holobionte/selection/partnerChoiceService');

const constitution = { riskTolerance: 'LOW', maxDependencyPerSymbiont: 0.6 };
const candidates = [
  { id: 'translator', capabilities: ['translate'], reliability: 0.9, evidenceQuality: 0.9,
    historicalCompatibility: 0.8, replaceability: 0.7, cost: 0.2, risk: 0.1, dependencyRisk: 0.2 },
  { id: 'reviewer', capabilities: ['review'], reliability: 0.8, evidenceQuality: 0.8,
    historicalCompatibility: 0.7, replaceability: 0.8, cost: 0.3, risk: 0.2, dependencyRisk: 0.3 },
  { id: 'risky', capabilities: ['translate', 'review'], reliability: 1, evidenceQuality: 1,
    historicalCompatibility: 1, replaceability: 1, cost: 0, risk: 0.8, dependencyRisk: 0.9 }
];

function testHostSpecificRanking() {
  const translation = rankCandidates({ constitution, gap: { requiredCapabilities: ['translate'] }, candidates });
  assert.strictEqual(translation[0].symbiontId, 'translator');
  assert.strictEqual(translation[0].eligible, true);
  const review = rankCandidates({ constitution, gap: { requiredCapabilities: ['review'] }, candidates });
  assert.strictEqual(review[0].symbiontId, 'reviewer');
  assert.strictEqual(review.find((item) => item.symbiontId === 'risky').eligible, false);
  assert.deepStrictEqual(review.find((item) => item.symbiontId === 'risky').reasons,
    ['RISK_TOLERANCE_EXCEEDED', 'DEPENDENCY_CEILING_EXCEEDED']);
}

function testValidationAndExplanation() {
  assert.throws(() => rankCandidates({ constitution, gap: { requiredCapabilities: [] }, candidates }), {
    code: 'HOLOBIONT_PARTNER_GAP_REQUIRED'
  });
  const result = rankCandidates({
    constitution, gap: { requiredCapabilities: ['translate', 'review'] },
    candidates: [{ id: 'partial', capabilities: ['translate'], reliability: 0.8 }]
  })[0];
  assert.strictEqual(result.vector.capabilityFit, 0.5);
  assert.deepStrictEqual(result.vector.missingCapabilities, ['review']);
}

testHostSpecificRanking();
testValidationAndExplanation();
console.log('✅ Holobiont Partner Choice tests passed.');
