'use strict';

const assert = require('assert');
const router = require('../src/services/philosophyRouter');
const specialized = require('../src/services/specializedEpistemologyService');

async function evaluate(concept, arguments_ = {}) {
  return router.handlePhilosophyRequest({
    request: { operation: 'evaluateConcept', arguments: { concept, ...arguments_ } },
  });
}

async function checkRegistryRoutes() {
  for (const concept of Object.keys(specialized.RUBRICS)) {
    const registered = router.getConcept(concept);
    assert.strictEqual(registered.status, 'partial', concept);
    assert.strictEqual(registered.service, 'specializedEpistemologyService', concept);
    assert.strictEqual(registered.serviceMaturity.executable, true, concept);
    const result = await evaluate(concept);
    assert.strictEqual(result.supported, true, concept);
    assert.strictEqual(result.result.contractVersion, 'genos.philosophy-analysis/v1', concept);
    assert.strictEqual(result.promotionEligible, false, concept);
    assert.ok(Array.isArray(result.result.evidence), concept);
    assert.ok(result.result.uncertainty, concept);
    assert.strictEqual(result.result.provenance.verified, false, concept);
    assert.ok(result.result.epistemic_context, concept);
  }
}

async function checkBoundedCalculations() {
  const bayes = await evaluate('method.bayesian-confirmation', {
    prior: 0.5, likelihood: 0.75, likelihoodNotH: 0.25,
  });
  assert.strictEqual(bayes.result.posterior, 0.75);
  assert.strictEqual(bayes.promotionEligible, false);

  const incompleteBayes = await evaluate('method.bayesian-confirmation');
  assert.strictEqual(incompleteBayes.result.status, 'insufficient-or-invalid-inputs');

  const dutchBook = await evaluate('method.dutch-book', { distribution: [0.4, 0.6] });
  assert.strictEqual(dutchBook.result.coherent, true);
  const missingDistribution = await evaluate('method.dutch-book');
  assert.strictEqual(missingDistribution.result.status, 'insufficient-data');

  const formal = await evaluate('science.godel-incompleteness', {
    effectiveAxiomatization: true,
  });
  assert.strictEqual(formal.result.status, 'undetermined');
  assert.strictEqual(formal.result.formalScope.missingAssumptions.length, 2);
  assert.strictEqual(formal.result.promotionEligible, false);
}

async function checkEvidenceRequiredForCriteria() {
  const result = await evaluate('school.empiricism', {
    criteria: [{ id: 'experience-as-source', supports: true }],
  });
  const criterion = result.result.criteria.find((item) => item.id === 'experience-as-source');
  assert.strictEqual(criterion.status, 'unknown');
  assert.strictEqual(criterion.evidence, null);
}

async function checkPartialCriteriaStayIndeterminate() {
  const result = await evaluate('school.empiricism', {
    criteria: [{ id: 'experience-as-source', supports: true, evidence: 'declared observation' }],
  });
  assert.strictEqual(result.result.status, 'partially-assessed');
  assert.strictEqual(result.result.counts.unknown, 2);
  assert.match(result.result.uncertainty, /non évalués/);
}

async function main() {
  assert.strictEqual(router.registryHealth().valid, true);
  await checkRegistryRoutes();
  await checkBoundedCalculations();
  await checkEvidenceRequiredForCriteria();
  await checkPartialCriteriaStayIndeterminate();
  console.log('Specialized epistemology: routes, bounded calculations and formal limits passed');
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
