'use strict';

const assert = require('node:assert/strict');
const router = require('../src/services/philosophyRouter');

const claim = {
  id: 'epistemology-contract-1',
  type: 'factual',
  statement: 'Le pipeline de test termine correctement.',
  evidence: [{ kind: 'test_result', result: 'exit 0' }]
};

async function evaluate(concept, args = {}) {
  return router.handlePhilosophyRequest({
    request: { operation: 'evaluateConcept', arguments: { concept, claim, truthValue: true, ...args } }
  });
}

async function main() {
  const supported = [
    'epistemology.knowledge', 'epistemology.belief', 'epistemology.justification',
    'epistemology.truth', 'epistemology.plausibility', 'epistemology.gettier-problem',
    'epistemology.gettierized-knowledge', 'epistemology.post-gettier-defenses',
    'epistemology.rationality-norms'
  ];
  for (const concept of supported) {
    const result = await evaluate(concept);
    assert.equal(result.supported, true, concept);
    assert.equal(result.executable, true, concept);
    assert.equal(typeof result.limitation, 'string', concept);
  }
  const invalid = await evaluate('epistemology.knowledge', { claim: { id: 'invalid', type: 'factual', statement: 'x' } });
  assert.equal(invalid.result.status, 'true-belief-without-justification');
  const rationality = await evaluate('epistemology.rationality-norms');
  assert.equal(rationality.result.promotionEligible, false);
}

main().then(() => console.log('Epistemology concept contracts passed.'));
