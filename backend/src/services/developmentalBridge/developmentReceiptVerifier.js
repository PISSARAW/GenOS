'use strict';

function verifyDevelopmentReceipt(input) {
  const receipt = input?.signedReceipt;
  if (!validRequest(input) || !validReceipt(receipt, input)) return unverified();
  if (!matchesClaim(receipt, input) || !trustedSignature(receipt)) return unverified();
  return { receiptId: input.receiptId, verifierId: receipt.verifierDigest,
    pathwayId: input.pathwayId, contextHash: input.contextHash, success: input.success,
    predictionError: input.predictionError, reward: input.reward, evidenceRefs: input.evidenceRefs };
}

function receiptClaim(input) {
  return { organizationId: input.scope.organizationId, projectId: input.scope.projectId,
    entityId: input.entityId, receiptId: input.receiptId, pathwayId: input.pathwayId,
    contextHash: input.contextHash || 'global', success: input.success,
    predictionError: input.predictionError, reward: Number.isFinite(input.reward) ? input.reward : null,
    evidenceRefs: input.evidenceRefs.map((item) => item.artifactHash).sort() };
}

function validRequest(input) {
  return Boolean(input?.scope?.organizationId && input.scope.projectId && input.entityId
    && input.receiptId && input.pathwayId && typeof input.success === 'boolean'
    && Number.isFinite(input.predictionError) && validEvidence(input.evidenceRefs));
}

function validReceipt(receipt, input) {
  return Boolean(receipt && receipt.resultId === input.receiptId
    && receipt.status === 'verified' && receipt.independent === true);
}

function validEvidence(evidence) {
  return Array.isArray(evidence) && evidence.length > 0
    && evidence.every((item) => item && /^[a-f0-9]{64}$/.test(item.artifactHash || '')
      && typeof item.verifierId === 'string' && item.verifierId.trim());
}

function matchesClaim(receipt, input) {
  return receipt.evidenceDigest === require('../epistemicAssuranceService').digest(receiptClaim(input));
}

function trustedSignature(receipt) {
  const trust = require('../verifierTrustRegistry');
  const verifier = require('../epistemicVerifierReceiptService');
  return verifier.validateReceipt(receipt, trust.resolveTrustedVerifierDigests());
}

function unverified() {
  throw Object.assign(new Error('GVX development receipt is not independently verified.'), {
    code: 'GVX_RECEIPT_UNVERIFIED'
  });
}

module.exports = { verifyDevelopmentReceipt, receiptClaim };
