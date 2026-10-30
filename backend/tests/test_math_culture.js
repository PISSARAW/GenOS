'use strict';

(async () => {

const assert = require('node:assert');
const { MathematicalCulture } = require('../src/services/mathematical/mathematicalCultureService');
const { createResearchLineage } = require('../src/services/mathematical/researchLineage');

// Mock ProofArtifact that is verified
const { mockVerifiedProof: createMockVerifiedProofArtifact } = require('./helpers/mockVerifiedProof.cjs');

const culture = new MathematicalCulture({ fidelityRate: 0.9 });

// Test 1: Verified lemma goes to knowledge, not strategies
const lemma = culture.addArtifact({
  type: 'lemma',
  content: '0 = 0',
  source: 'goldbach-lineage',
  verified: true,
  proofArtifact: await createMockVerifiedProofArtifact(),
});
assert.ok(lemma.id);
assert.strictEqual(lemma.verified, true);

const target1 = createResearchLineage({ name: 'target1' });
culture.transmit(lemma.id, target1);
assert.ok(target1._knowledge, 'Target should have knowledge base');
assert.ok(target1._knowledge.length === 1);
assert.ok(!target1.genome.strategies.includes('0 = 0'), 'Lemma should not be a strategy');

// Test 2: Unverified heuristic goes to strategies
const heuristic = culture.addArtifact({
  type: 'heuristic',
  content: 'try_induction_first',
  verified: false,
});

const target2 = createResearchLineage({ name: 'target2' });
culture.transmit(heuristic.id, target2);
assert.ok(target2.genome.strategies.includes('try_induction_first'), 'Heuristic should be a strategy');

// Test 3: Verified tactic requires proof
const tactic = culture.addArtifact({
  type: 'tactic',
  content: '0 = 0',
  verified: true,
  proofArtifact: await createMockVerifiedProofArtifact(),
});
const selected = culture.selectForTransmission(tactic.id, target2);
assert.ok(selected !== null);

// Test 4: Forged verified: true without proof should throw
let threw = false;
try {
  culture.addArtifact({ type: 'lemma', content: 'fake', verified: true });
} catch (e) {
  threw = true;
  assert.ok(e.message.includes('Verified artifacts require'));
}
assert.ok(threw, 'Should throw for forged verified artifact');

// Summary
const s = culture.summary();
assert.ok(s.artifacts >= 2);
assert.ok(s.transmissions >= 1);

console.log('OK MathematicalCulture (verified vs unverified separation, proof required)');

})().catch(error => { console.error(error); process.exitCode = 1; });
