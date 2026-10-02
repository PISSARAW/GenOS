'use strict';

const IMPLEMENTATION_ID = 'artifact-integrity-v1';
const REQUIREMENT = 'artifact-integrity';
const SOMATIC_ID = 'gvx-somatic-assessment-v1';
const SOMATIC_REQUIREMENT = 'gvx-somatic-assessment';

function registerBuiltInVerifiers(registry) {
  const trust = require('./verifierTrustRegistry');
  trust.registerVerifier({ id: IMPLEMENTATION_ID, type: 'artifact',
    digest: trust.computeVerifierDigest(IMPLEMENTATION_ID, '1.0'),
    description: 'Confirms artifact bytes match the declared SHA-256; does not assess semantic correctness.' });
  registry.registerVerifierImplementation({ id: IMPLEMENTATION_ID,
    requirements: [REQUIREMENT], verify: verifyArtifactIntegrity });
  trust.registerVerifier({ id: SOMATIC_ID, type: 'benchmark',
    digest: trust.computeVerifierDigest(SOMATIC_ID, '1.0'),
    description: 'Recomputes GVX somatic assessment rules over independently evidenced metrics.' });
  registry.registerVerifierImplementation({ id: SOMATIC_ID,
    requirements: [SOMATIC_REQUIREMENT], verify: verifySomaticAssessment });
}

function verifyArtifactIntegrity(input) {
  const matches = input.evidence?.artifactHash === input.artifactHash;
  return { verified: matches, evidenceClass: 'artifact_integrity_only',
    reason: matches ? null : 'declared-artifact-hash-mismatch' };
}

function parseAssessment(input) {
  try { return JSON.parse(input.artifact.toString('utf8')); } catch (_) { return null; }
}

function evidencePairs(items) {
  return (items || []).map((item) => `${item.artifactHash}\0${item.verifierId}`).sort();
}

function receiptsCoverEvidence(refs, proofs) {
  const available = new Set(evidencePairs(proofs));
  return evidencePairs(refs).length > 0 && evidencePairs(refs).every((pair) => available.has(pair));
}

function conservativeSomaticProfile(profile) {
  const rules = profile?.rules || [];
  return profile?.id === 'gvx-somatic-conservative-v1' && profile.minSamples >= 3
    && rules.length >= 2 && rules.every((rule) => rule.maxRegression === 0)
    && rules.some((rule) => rule.metric === 'safety' && rule.objective === 'maintain')
    && rules.some((rule) => ['higher', 'lower'].includes(rule.objective) && rule.minImprovement > 0);
}

function matchingMetricProof(proof, input) {
  const decision = proof.businessDecision;
  const estimate = input.assessmentInput?.[input.arm]?.metrics?.[input.metric];
  return proof.requirement === `gvx-somatic-metric:${input.metric}`
    && decision?.metric === input.metric && decision.arm === input.arm
    && decision.mean === estimate?.mean && decision.samples === estimate?.samples
    && input.refPairs.has(`${proof.artifactHash}\0${proof.verifierId}`);
}

function hasMetricArmProof(input) {
  const estimate = input.assessmentInput?.[input.arm]?.metrics?.[input.metric];
  return Number.isFinite(estimate?.mean) && Number.isInteger(estimate.samples)
    && input.proofs.some((proof) => matchingMetricProof(proof, input));
}

function everySomaticMetricHasProof(assessmentInput, refs, proofs) {
  const refPairs = new Set(evidencePairs(refs));
  return assessmentInput.profile.rules.every((rule) => ['baseline', 'candidate'].every((arm) =>
    hasMetricArmProof({ assessmentInput, proofs, metric: rule.metric, arm, refPairs })));
}

function verifySomaticAssessment(input) {
  const artifact = parseAssessment(input);
  if (!artifact || artifact.schema !== 'genos.gvx.somatic-assessment/v1'
      || input.evidence?.artifactHash !== input.artifactHash) return { verified: false };
  const refs = artifact.assessmentInput?.evidenceRefs;
  const proofs = input.evidence?.supportingReceipts;
  if (!conservativeSomaticProfile(artifact.assessmentInput.profile) || !refs?.length
      || !receiptsCoverEvidence(refs, proofs)
      || !everySomaticMetricHasProof(artifact.assessmentInput, refs, proofs)) {
    return { verified: false, reason: 'somatic-evidence-receipts-missing' };
  }
  try {
    const expected = require('./gvxSomaticAssessment').assessSomaticCandidate(artifact.assessmentInput);
    const same = require('./epistemicAssuranceService').digest(expected)
      === require('./epistemicAssuranceService').digest(artifact.assessment);
    return { verified: same && artifact.assessment.promotionAllowed === false,
      evidenceClass: 'gvx_somatic_assessment_semantics',
      businessDecision: { assessmentStatus: artifact.assessment.status } };
  } catch (_) { return { verified: false, reason: 'somatic-assessment-rules-invalid' }; }
}

module.exports = { IMPLEMENTATION_ID, REQUIREMENT, SOMATIC_ID, SOMATIC_REQUIREMENT,
  registerBuiltInVerifiers, verifyArtifactIntegrity, verifySomaticAssessment };
