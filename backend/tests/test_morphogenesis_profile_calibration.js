'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const policyFile = path.join(__dirname, `.genos-profile-policy-${process.pid}.json`);
process.env.GENOS_MORPHOLOGY_POLICY_PATH = policyFile;
process.env.GENOS_EPISTEMIC_RECEIPT_SECRET = 'morphology-profile-calibration-test';

const profiler = require('../src/services/morphogenesis/profiling/problemMorphologyProfiler');
const profileCalibration = require('../src/services/morphogenesis/learning/problemProfileCalibration');
const evidenceValidation = require('../src/services/morphogenesis/learning/outcomeEvidenceValidation');
const learning = require('../src/services/morphogenesis/morphologyLearningService');
const causalLoop = require('../src/services/morphogenesis/causalLoopService');
const { compareTopologies } = require('../src/services/morphogenesis/topologyResolverService');

function completeProfile() {
  const dimensions = {};
  for (const [index, name] of profiler.PROFILE_DIMENSIONS.entries()) {
    dimensions[name] = { value: (index + 1) / 20, confidence: 0.9,
      evidenceRefs: [`measurement:${name}`] };
  }
  return profiler.createProblemMorphologyProfile(dimensions, {
    observedAt: '2026-10-18T00:00:00.000Z', scopeId: 'profile-calibration-test', source: 'paired-campaign'
  });
}

function verifiedEvidence(profile, input) {
  const learningContext = {
    problemSignature: 'paired-profile-family',
    problemProfile: profile,
    problemProfileSha256: profileCalibration.problemProfileDigest(profile),
    initialMorphology: { topology: input.topology },
    environment: 'test', model: 'deterministic-fixture', harness: 'paired-profile-v1',
    budget: { tokens: 1000, latencyMs: 5000 }
  };
  const evidence = {
    status: 'VERIFIED', kind: 'benchmark', receiptId: input.receiptId,
    success: true, value: 1, learningContext,
    actionId: input.actionId, agentId: 'profile-agent',
    organizationId: 'profile-org', projectId: 'profile-project'
  };
  const verifierDigest = require('../src/services/verifierTrustRegistry').listVerifierDigests()[0];
  evidence.receipt = require('../src/services/epistemicVerifierReceiptService').issueReceipt({
    resultId: evidence.receiptId,
    evidenceDigest: evidenceValidation.evidenceDigest(evidence),
    verifierDigest, independent: true, status: 'verified'
  });
  return evidence;
}

const profile = completeProfile();
const initialRanking = compareTopologies({ problemProfile: profile });
const target = initialRanking.at(-1).topology;
const firstEvidence = verifiedEvidence(profile, {
  topology: target, receiptId: 'profile-calibration:0', actionId: 'profile-action:0'
});
const loopReceipt = causalLoop.processActionReceipt({
  agentId: 'profile-agent', organizationId: 'profile-org', projectId: 'profile-project',
  actionReceipt: {
    actionId: 'profile-action:0', outcome: { success: true, quality: 1 },
    expectedOutcome: { success: true, quality: 0.5 }, qualityEvidence: firstEvidence
  }
});
assert.equal(loopReceipt.morphologyExperience.recorded, true);
assert.equal(compareTopologies({ problemProfile: profile })[0].learnedWeight, 0);
assert.equal(compareTopologies({ problemProfile: profile })[0].calibrationStatus, 'warming_up');

for (let index = 1; index < 40; index += 1) {
  const evidence = verifiedEvidence(profile, {
    topology: target, receiptId: `profile-calibration:${index}`, actionId: `profile-action:${index}`
  });
  assert.ok(learning.recordExperience({ problemFeatures: profile,
    morphology: { topology: target }, outcomeEvidence: evidence }));
}

const calibrated = compareTopologies({ problemProfile: profile });
assert.equal(calibrated[0].topology, target);
assert.equal(calibrated[0].learnedSamples, 40);
assert.equal(calibrated[0].learningEvidenceKind, 'verified_19d_profile');
assert.equal(calibrated[0].calibrationStatus, 'calibrated');

const tampered = structuredClone(profile);
tampered.dimensions.adversarialRisk.value = 0.99;
assert.equal(learning.recordExperience({ problemFeatures: tampered,
  morphology: { topology: target }, outcomeEvidence: firstEvidence }), null);

const unsigned = structuredClone(firstEvidence);
delete unsigned.receipt;
assert.equal(learning.recordExperience({ problemFeatures: profile,
  morphology: { topology: target }, outcomeEvidence: unsigned }), null);

const saved = JSON.parse(fs.readFileSync(policyFile, 'utf8'));
assert.equal(saved.observations.length, 40);
assert.equal(saved.observations[0].profileDigest, profileCalibration.problemProfileDigest(profile));
fs.rmSync(policyFile, { force: true });
delete process.env.GENOS_MORPHOLOGY_POLICY_PATH;
delete process.env.GENOS_EPISTEMIC_RECEIPT_SECRET;
console.log('Signed 19D outcomes calibrate topology ranking only after the evidence threshold.');
