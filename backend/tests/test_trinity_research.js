'use strict';

const assert = require('node:assert/strict');
const research = require('../src/services/trinityResearchDesign');
const calibration = require('../src/services/trinityResearchCalibration');
const receipts = require('../src/services/epistemicVerifierReceiptService');
const trust = require('../src/services/verifierTrustRegistry');
const runtime = require('../src/services/trinityResearchRuntime');
const trinity = require('../src/services/trinityService');
const { unionVolume } = require('../src/services/trinityHypervolume');

process.env.GENOS_EPISTEMIC_RECEIPT_SECRET = 'trinity-research-test-only';

function testInformationGain() {
  const priors = [1 / 3, 1 / 3, 1 / 3];
  const independent = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  assert.ok(Math.abs(research.informationGain({ priors, likelihoods: independent }) - Math.log2(3)) < 1e-9);
  assert.equal(research.informationGain({ priors, likelihoods: Array(3).fill([0.5, 0.5]) }), 0);
  assert.equal(research.informationGain({ priors, likelihoods: [undefined, [1], [1]] }), null);
  assert.equal(research.informationGain({ priors: [0.1], likelihoods: [[1]] }), null);
}

function candidates() {
  return ['direct', 'structured', 'falsification'].map((chamber, index) => ({
    id: `h${index}`, chamber, hypothesis: `Testable distinct explanation ${index}`, sourceRefs: ['mission'],
    assumptions: [`assumption ${index}`], predictions: [`outcome ${index}`], falsificationCriteria: ['repeat the protocol'],
    research: { coverage: [`region${index}`], tokens: 100, latencyMs: 100, falsificationProbability: 0.8 }
  }));
}

function testUtility() {
  const config = { solutionSpace: ['region0', 'region1', 'region2'], tokenBudget: 400, latencyBudgetMs: 200,
    experiments: [{ id: 'discriminating', protocol: 'Run the three diagnostic measurements', costTokens: 100,
      sourceRefs: ['mission'], likelihoods: { h0: [1, 0, 0], h1: [0, 1, 0], h2: [0, 0, 1] } }] };
  const design = trinity.designHypotheses('Determine which explanation matches the measurements', {
    candidateHypotheses: candidates(), research: config
  });
  assert.equal(design.selectionMethod, 'model_utility_v1');
  assert.equal(design.utility.components.coverage, 1);
  assert.ok(design.experimentDesign.informationGain > 1.5);
  assert.equal(design.utility.calibrated, false);
  assert.equal(research.select(candidates(), { ...config, tokenBudget: 200 }), null);
  assert.throws(() => trinity.designHypotheses('Determine cause', { research: config }), { code: 'TRINITY_RESEARCH_MODEL_REQUIRED' });
}

function sample(index) {
  const success = index % 2;
  const row = { id: `sample_${String(index).padStart(3, '0')}`, sourceRefs: [`fixture:${index}`], trinityBetter: success,
    errors: [success, success, 1 - success],
    signals: { hypothesisCount: 1, domainUncertainty: success, errorCost: 0.5, irreversibility: 0.5,
      oracleAvailability: 1, errorCorrelation: 0.5, budgetRatio: 0.5 } };
  row.receipt = receipts.issueReceipt({ resultId: row.id, evidenceDigest: calibration.sampleDigest(row),
    verifierDigest: trust.getVerifier('benchmark').digest, independent: true,
    independenceDescriptor: { actorId: 'test-benchmark', workspaceId: 'independent-fixture-workspace' } });
  return row;
}

function testCalibration() {
  assert.equal(calibration.calibrate([]).status, 'insufficient_data');
  const rows = Array.from({ length: 50 }, (_, index) => sample(index));
  const model = calibration.calibrate(rows);
  assert.equal(model.status, 'calibrated');
  assert.equal(model.trainingSize, 40);
  assert.equal(model.validationSize, 10);
  assert.ok(model.brier < model.baselineBrier);
  assert.ok(calibration.evaluate(model, rows[1].signals) > calibration.evaluate(model, rows[0].signals));
  assert.equal(calibration.evaluate({ ...model, weights: model.weights.map(value => value + 1) }, rows[1].signals), null);
  assert.equal(calibration.calibrate(rows.map(row => ({ ...row, trinityBetter: 1 - row.trinityBetter }))).sampleSize, 0);
  assert.equal(calibration.calibrate([...rows, rows[0]]).status, 'invalid');
  assert.equal(calibration.errorCorrelation(rows).status, 'measured');
  assert.ok(Math.abs(calibration.errorCorrelation(rows).correlation + 1 / 3) < 1e-8);
}

function testSemanticReview() {
  const verified = row => ({ id: row, statement: 'The measured result establishes the property', evidence: ['measurement'],
    verificationLevel: 'independent_deterministic', verificationReceipts: [{ receipt: sample(0).receipt }],
    proposition: { subject: 'algorithm', predicate: 'terminates', value: row === 'a' } });
  const review = runtime.semanticReview([1, 2].map((worldNumber, index) => ({ worldNumber,
    report: { claims: [verified(index === 0 ? 'a' : 'b')] } })));
  assert.equal(review.relations[0].type, 'contradicts');
  assert.equal(review.decisionAuthority, 'none');
}

assert.equal(runtime.adjustMetric('correctness', 0.9, 0.5), 0.45);
assert.ok(Math.abs(runtime.adjustMetric('risk', 0.1, 0.5) - 0.55) < 1e-9);
assert.equal(runtime.adjustMetric('cost', 2, 1), null);

testInformationGain();
testUtility();
testCalibration();
testSemanticReview();
assert.equal(unionVolume([[1, 1], [1, 1]]), 1);
assert.equal(unionVolume([[2, 1], [1, 2]]), 3);
assert.equal(unionVolume([[1, 1, 1], [2, 1, 1]]), 2);
console.log('Trinity research, calibration integrity and exact hypervolume: PASS');

const { mutualInformation } = require('../src/services/trinityMutualInformation');
assert.equal(mutualInformation([[0.25, 0.25], [0.25, 0.25]]), 0);
assert.equal(mutualInformation([[0.5, 0], [0, 0.5]]), 1);
assert.equal(mutualInformation([[1, -1]]), null);
