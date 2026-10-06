'use strict';
const { assert, crypto, trinity, trinityVariants, trinityAdapters, balanceVerifier, missionVerifier, counterfactual, adversarial, factorial, diversity, recursive, temporal, sequential, oracle, novelty, pareto, blindJury, trinityClaimVerification, modelRouter, EXECUTABLE_VARIANTS, FACTUAL_MISSIONS, makeReceipt, createWorldReport, leaf, node, canonicalTree } = require('./fixtures');

async function testVariantGating() {
  console.log('\n=== Testing Variant Precondition Gating ===');

  let threw = false;
  try {
    trinityVariants.selectForMission('Factorial mission', { variantId: 'factorial', availableAdapters: [] });
  } catch (e) {
    threw = true;
    assert.equal(e.code, 'TRINITY_ADAPTER_NOT_EXECUTABLE');
  }
  assert.ok(threw);

  threw = false;
  try {
    trinityVariants.selectForMission('Jury mission', { variantId: 'jury' });
  } catch (e) {
    threw = true;
    assert.equal(e.code, 'TRINITY_VARIANT_PRECONDITION_MISSING');
  }
  assert.ok(threw);

  threw = false;
  try {
    trinityVariants.selectForMission('Nope', { variantId: 'unknown-variant' });
  } catch (e) {
    threw = true;
    assert.equal(e.code, 'TRINITY_VARIANT_UNKNOWN');
  }
  assert.ok(threw);

  console.log('✓ Variant gating: missing adapters, missing jury config, unknown variant all properly rejected');
  return { success: true };
}

module.exports = { testVariantGating };
