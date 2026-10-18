'use strict';

const assert = require('node:assert/strict');
const { validateRegistry } = require('../src/philosophy/conceptRegistry');
const { compileRegistry, assessPromotion } = require('../src/philosophy/implementationContracts');
const { runContractExperiment } = require('../src/philosophy/contractExperiments');
const attestations = require('../src/philosophy/independentAttestation');
const { issueReceipt } = require('../src/services/epistemicVerifierReceiptService');
const { ensureVerifier } = require('../src/services/verifierTrustRegistry');
const { evaluateIndependence } = require('../src/services/epistemicScheduler/independencePolicy');
const router = require('../src/services/philosophyRouter');

const contracts = compileRegistry(validateRegistry().concepts).contracts;
const contract = contracts.find((item) => item.id === 'core.self');
const runtimeReceipt = attestations.runRuntimeEvidence(contract, contracts);
assert.equal(attestations.verifyRuntimeEvidence(runtimeReceipt, contract, contracts), true);
assert.equal(runtimeReceipt.actualWorkerDispatch, false);
assert.equal(runtimeReceipt.actualTopologyExecution, false);
assert.equal(runtimeReceipt.externalFactsVerified, false);
assert.equal(runtimeReceipt.promotionEligible, false);

const previousSecret = process.env.GENOS_EPISTEMIC_RECEIPT_SECRET;
process.env.GENOS_EPISTEMIC_RECEIPT_SECRET = 'phase-6-independent-attestation-test';

function signedVerifierReceipt(subject) {
  const descriptor = {
    actorId: 'independent-philosophy-verifier', model: 'independent-node', version: '2',
    strategy: 'receipt-replay', evidenceSource: `receipt:${subject.receiptHash}`,
    workspaceId: 'isolated-philosophy-verification',
  };
  const independence = evaluateIndependence(descriptor, [subject.producer]);
  return issueReceipt({
    ...attestations.attestationRequest(contract, subject),
    verifierDigest: ensureVerifier('replay').digest, status: 'verified', independent: independence.independent,
    independenceDescriptor: descriptor, independenceDistance: independence.distance,
  });
}

async function main() {
  try {
    const verifierReceipt = signedVerifierReceipt(runtimeReceipt);
    const independentReceipt = attestations.admitIndependentAttestation(contract, {
      runtimeReceipt, verifierReceipt, contracts,
    });
    assert.equal(attestations.verifyIndependentAttestation(independentReceipt, contract, {
      evidence: [runtimeReceipt], contracts,
    }), true);
    assert.equal(independentReceipt.independentValidation, true);
    assert.equal(independentReceipt.externalFactsVerified, false);
    assert.equal(independentReceipt.promotionEligible, false);

    const scenarioReceipt = runContractExperiment(contract);
    const evidence = [scenarioReceipt, runtimeReceipt, independentReceipt];
    const assessment = assessPromotion(contract, 'validated', { evidence, contracts });
    assert.equal(assessment.eligible, true);
    assert.equal(assessment.promotionEligible, false);
    assert.deepEqual(assessment.missingEvidence, []);
    assert.deepEqual(new Set(assessment.verifiedEvidence),
      new Set(['scenario-receipt', 'runtime-receipt', 'independent-receipt']));

    const incomplete = assessPromotion(contract, 'validated', { evidence: [scenarioReceipt, independentReceipt], contracts });
    assert.equal(incomplete.eligible, false);
    assert.ok(incomplete.missingEvidence.includes('runtime-receipt'));
    assert.ok(incomplete.missingEvidence.includes('independent-receipt'));

    const selfDescriptor = runtimeReceipt.producer;
    const selfReceipt = issueReceipt({
      ...attestations.attestationRequest(contract, runtimeReceipt),
      verifierDigest: ensureVerifier('replay').digest, independent: true,
      independenceDescriptor: selfDescriptor, independenceDistance: 0,
    });
    assert.throws(() => attestations.admitIndependentAttestation(contract, {
      runtimeReceipt, verifierReceipt: selfReceipt, contracts,
    }), /Independent philosophy receipt is invalid/);
    assert.throws(() => attestations.admitIndependentAttestation(contract, {
      runtimeReceipt: { ...runtimeReceipt, passed: false }, verifierReceipt, contracts,
    }), /Runtime philosophy receipt is invalid/);

    const uncovered = contracts.find((item) => item.id === 'core.agent');
    assert.throws(() => attestations.runRuntimeEvidence(uncovered, contracts), /no representative/);

    const routedRuntime = await router.handlePhilosophyRequest({ request: {
      operation: 'runPhilosophyRuntimeEvidence', arguments: { conceptId: contract.id },
    } });
    const routedVerifier = signedVerifierReceipt(routedRuntime);
    const routedIndependent = await router.handlePhilosophyRequest({ request: {
      operation: 'admitIndependentPhilosophyAttestation', arguments: {
        conceptId: contract.id, runtimeReceipt: routedRuntime, verifierReceipt: routedVerifier,
      },
    } });
    const routedAssessment = await router.handlePhilosophyRequest({ request: {
      operation: 'assessContractPromotion', arguments: {
        conceptId: contract.id, targetMaturity: 'validated',
        evidence: [scenarioReceipt, routedRuntime, routedIndependent],
      },
    } });
    assert.equal(routedAssessment.eligible, true);
    assert.equal(routedAssessment.promotionEligible, false);
    console.log('Independent philosophy attestation admission and maturity evidence passed.');
  } finally {
    if (previousSecret === undefined) delete process.env.GENOS_EPISTEMIC_RECEIPT_SECRET;
    else process.env.GENOS_EPISTEMIC_RECEIPT_SECRET = previousSecret;
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
