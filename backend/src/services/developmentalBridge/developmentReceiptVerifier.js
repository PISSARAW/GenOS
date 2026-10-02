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
    evidenceRefs: input.evidenceRefs.map((item) => `${item.artifactHash}\0${item.verifierId}`).sort() };
}

function validRequest(input) {
  return Boolean(input?.scope?.organizationId && input.scope.projectId && input.entityId
    && input.receiptId && input.pathwayId && typeof input.success === 'boolean'
    && Number.isFinite(input.predictionError) && validEvidence(input.evidenceRefs));
}

function validReceipt(receipt, input) {
  return Boolean(receipt && receipt.schema === 'genos.gvx.development-receipt/v2'
    && receipt.resultId === input.receiptId
    && receipt.status === 'verified' && receipt.independent === true
    && receipt.evidenceCount === input.evidenceRefs.length);
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
  return trustedRemoteSignature(receipt);
}

function trustedRemoteSignature(receipt) {
  try {
    const crypto = require('node:crypto');
    const pem = String(process.env.GENOS_GVX_VERIFIER_PUBLIC_KEY || '');
    if (!pem) return false;
    const publicKey = crypto.createPublicKey(pem);
    const keyId = `sha256:${crypto.createHash('sha256')
      .update(publicKey.export({ type: 'spki', format: 'der' })).digest('hex')}`;
    const { signature, ...payload } = receipt;
    return receipt.verifierDigest === keyId && typeof signature === 'string'
      && crypto.verify(null, Buffer.from(JSON.stringify(payload)), publicKey, Buffer.from(signature, 'base64'));
  } catch (_) { return false; }
}

function unverified() {
  throw Object.assign(new Error('GVX development receipt is not independently verified.'), {
    code: 'GVX_RECEIPT_UNVERIFIED'
  });
}

module.exports = { verifyDevelopmentReceipt, receiptClaim };
