'use strict';

const crypto = require('node:crypto');
const { appendEvent, getEvent, listEvents } = require('../gvxDevelopmentLedger');

async function creditVerifiedReceipt(db, input) {
  validateRequest(input);
  const receipt = await input.receiptVerifier.verify({ receiptId: input.receiptId, scope: input.scope, entityId: input.entityId });
  validateVerifiedReceipt(receipt, input);
  const key = creditKey(input, receipt);
  if (await getEvent(db, `gvx-credit-claim:${key}`, ledgerScope(input))) return { credited: false, reason: 'receipt-already-claimed' };
  await appendClaim({ db, input, receipt, key });
  try {
    const plasticity = await recordAgowCredit(input, receipt);
    const supportCount = await recordAppliedCredit({ db, input, receipt, key });
    const consolidation = await consolidateAfterSupport(input, receipt, supportCount);
    return { credited: true, supportCount, plasticity, consolidation };
  } catch (error) {
    await recordFailure({ db, input, receipt, key, error });
    throw error;
  }
}

async function appendClaim({ db, input, receipt, key }) {
  await appendEvent(db, {
    id: `gvx-credit-claim:${key}`, ...input.scope, entityId: input.entityId,
    type: 'evidence_attached', payload: { kind: 'developmental_credit_claim',
      receiptId: receipt.receiptId, verifierId: receipt.verifierId, pathwayId: receipt.pathwayId }
  });
}

async function recordAgowCredit(input, receipt) {
  return require('../agow/plasticity/agowPlasticityCoordinator').recordOutcome({
    db: input.db, agentId: input.agentId, pathwayId: receipt.pathwayId,
    contextHash: receipt.contextHash, success: receipt.success,
    predictionError: receipt.predictionError, reward: receipt.reward,
    evidenceStatus: 'verified', evidenceRefs: [receipt.receiptId, ...receipt.evidenceRefs.map((item) => item.artifactHash)]
  });
}

async function recordAppliedCredit({ db, input, receipt, key }) {
  await appendEvent(db, {
    id: `gvx-credit-applied:${key}`, ...input.scope, entityId: input.entityId,
    type: 'evidence_attached', payload: { kind: 'developmental_credit_applied',
      receiptId: receipt.receiptId, pathwayId: receipt.pathwayId,
      contextHash: receipt.contextHash || 'global', verifierId: receipt.verifierId,
      success: receipt.success }
  });
  const events = await listEvents(db, { ...input.scope, entityId: input.entityId });
  const credits = events.filter((event) => event.payload.kind === 'developmental_credit_applied'
    && event.payload.success === true
    && event.payload.pathwayId === receipt.pathwayId
    && event.payload.contextHash === (receipt.contextHash || 'global'));
  return credits.length;
}

async function consolidateAfterSupport(input, receipt, supportCount) {
  if (!receipt.success || supportCount < 3) return { consolidated: false, reason: 'three_distinct_gvx_receipts_required' };
  return require('../agow/plasticity/agowPlasticityCoordinator').consolidatePathway({
    db: input.db, agentId: input.agentId,
    key: `${receipt.pathwayId}:${receipt.contextHash || 'global'}`, evidenceStatus: 'verified'
  });
}

async function recordFailure({ db, input, receipt, key, error }) {
  try {
    await appendEvent(db, {
      id: `gvx-credit-failed:${key}`, ...input.scope, entityId: input.entityId,
      type: 'evidence_attached', payload: { kind: 'developmental_credit_failed',
        receiptId: receipt.receiptId, reason: error.code || 'credit-failed' }
    });
  } catch (_) { /* Claim remains durable and prevents duplicate plasticity credit. */ }
}

function validateRequest(input) {
  if (!input || !input.scope?.organizationId || !input.scope?.projectId || !input.entityId
      || !input.agentId || !input.receiptId || !input.db
      || !input.receiptVerifier || typeof input.receiptVerifier.verify !== 'function') {
    throw Object.assign(new Error('GVX receipt verification adapter is required.'), { code: 'GVX_RECEIPT_VERIFIER_REQUIRED' });
  }
}

function validateVerifiedReceipt(receipt, input) {
  if (!hasVerifiedIdentity(receipt, input) || !hasVerifiedEvidence(receipt)) {
    throw Object.assign(new Error('GVX development receipt is not independently verified.'), { code: 'GVX_RECEIPT_UNVERIFIED' });
  }
}

function hasVerifiedIdentity(receipt, input) {
  return Boolean(receipt && receipt.verified === true && receipt.receiptId === input.receiptId
    && typeof receipt.verifierId === 'string' && receipt.verifierId.trim()
    && typeof receipt.pathwayId === 'string' && receipt.pathwayId.trim()
    && typeof receipt.success === 'boolean' && Number.isFinite(receipt.predictionError));
}

function hasVerifiedEvidence(receipt) {
  return Array.isArray(receipt.evidenceRefs) && receipt.evidenceRefs.length > 0
    && receipt.evidenceRefs.every(validArtifact);
}

function validArtifact(item) {
  return Boolean(item && /^[a-f0-9]{64}$/.test(item.artifactHash || '')
    && typeof item.verifierId === 'string' && item.verifierId.trim());
}

function creditKey(input, receipt) {
  const tuple = [input.scope.organizationId, input.scope.projectId, input.entityId, receipt.receiptId].join('\0');
  return crypto.createHash('sha256').update(tuple).digest('hex');
}

function ledgerScope(input) { return { ...input.scope, entityId: input.entityId }; }

module.exports = { creditVerifiedReceipt, validateVerifiedReceipt };
