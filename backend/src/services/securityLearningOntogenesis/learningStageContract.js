'use strict';

const { hash: gvxHash, canonical: gvxCanonical } = require('../gvxContracts');
const gvxVerifierRegistry = require('../gvxVerifierRegistry');
const verifierTrustRegistry = require('../verifierTrustRegistry');
const { issueReceipt, validateReceipt } = require('../epistemicVerifierReceiptService');

const LEARNING_STAGES = Object.freeze([
  'observation',
  'hypothesis',
  'test',
  'verification',
  'qualification',
  'memory',
  'controlled_reuse',
]);

const STAGE_INDEX = Object.freeze(
  Object.fromEntries(LEARNING_STAGES.map((stage, idx) => [stage, idx])),
);

const QUALIFICATION_DISPOSITIONS = Object.freeze({
  CONFIRMED_INCIDENT: 'confirmed_incident',
  FALSE_POSITIVE: 'false_positive',
  UNVALIDATED_CONJECTURE: 'unvalidated_conjecture',
});

function learningError(code, message, details = {}) {
  return Object.assign(new Error(message || code), { code, ...details });
}

function sha256Prefixed(value) {
  return `sha256:${gvxHash(value)}`;
}

function assertStageTransition(currentStage, targetStage) {
  const targetIdx = STAGE_INDEX[targetStage];
  if (targetIdx === undefined) {
    throw learningError('SECURITY_LEARNING_STAGE_UNKNOWN', `Unknown learning stage '${targetStage}'.`);
  }
  if (targetIdx === 0) {
    return true;
  }
  const currentIdx = STAGE_INDEX[currentStage] ?? -1;
  if (currentIdx < targetIdx - 1) {
    const requiredPrior = LEARNING_STAGES[targetIdx - 1];
    throw learningError(
      'SECURITY_LEARNING_STAGE_ORDER_VIOLATION',
      `Cannot enter stage '${targetStage}' before completing '${requiredPrior}' (current: '${currentStage ?? 'none'}').`,
      { currentStage, targetStage, requiredPrior },
    );
  }
  return true;
}

async function verifyArtifactWithGvx(artifactPayload, artifactRef) {
  const controlPlaneRegistry = gvxVerifierRegistry.fromTrustedRegistry(['artifact-integrity-v1']);
  const serialized = Buffer.from(JSON.stringify(gvxCanonical(artifactPayload)), 'utf8');
  const artifactHash = gvxVerifierRegistry.digest(serialized);
  const verification = await gvxVerifierRegistry.verifyEvidence({
    registry: controlPlaneRegistry,
    artifactReader: async () => serialized,
    evidence: {
      artifactRef,
      artifactHash,
      verifierId: 'artifact-integrity-v1',
    },
    requirement: 'artifact-integrity',
  });
  if (!verification.verified) {
    throw learningError('SECURITY_LEARNING_GVX_VERIFICATION_FAILED', 'GVX artifact integrity verification failed.');
  }
  return Object.freeze({
    verified: true,
    artifactRef,
    artifactHash: `sha256:${artifactHash}`,
    rawArtifactHash: artifactHash,
    verifierId: verification.verifierId,
    verifierVersion: verification.verifierVersion,
  });
}

function issueIndependentVerifierReceipt(spec) {
  const verifierType = spec.verifierType ?? 'proof';
  const entry = verifierTrustRegistry.getVerifier(verifierType) ?? verifierTrustRegistry.ensureVerifier('proof');
  if (!spec.actorId || spec.actorId === spec.InvestigationAuthorId) {
    throw learningError(
      'SECURITY_LEARNING_INDEPENDENCE_VIOLATION',
      'Verifier actorId must be present and distinct from the investigation author.',
    );
  }
  return issueReceipt({
    resultId: spec.resultId,
    evidenceDigest: spec.evidenceDigest,
    verifierDigest: entry.digest,
    status: spec.status ?? 'verified',
    independent: true,
    coveredObligations: spec.coveredObligations ?? [spec.resultId],
    independenceDescriptor: {
      actorId: spec.actorId,
      role: spec.role ?? 'independent_auditor',
      modelFamily: spec.modelFamily ?? 'independent-verifier-family',
    },
    independenceDistance: spec.independenceDistance ?? 1,
  });
}

function isReceiptTrustedAndValid(receipt) {
  const trustedDigests = verifierTrustRegistry.listVerifierDigests();
  return validateReceipt(receipt, trustedDigests);
}

module.exports = {
  LEARNING_STAGES,
  STAGE_INDEX,
  QUALIFICATION_DISPOSITIONS,
  learningError,
  sha256Prefixed,
  assertStageTransition,
  verifyArtifactWithGvx,
  issueIndependentVerifierReceipt,
  isReceiptTrustedAndValid,
};
