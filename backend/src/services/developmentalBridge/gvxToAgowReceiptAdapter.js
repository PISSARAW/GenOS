'use strict';

const crypto = require('node:crypto');
const { appendEvent, getEvent, listEvents } = require('../gvxDevelopmentLedger');
const { verifyDevelopmentReceipt } = require('./developmentReceiptVerifier');

async function creditVerifiedReceipt(db, input) {
  validateRequest(input);
  const receipt = verifyDevelopmentReceipt(input);
  const key = creditKey(input, receipt);
  const scope = ledgerScope(input);
  if (await getEvent(db, `gvx-credit-applied:${key}`, scope)) {
    return { credited: false, reason: 'receipt-already-claimed' };
  }
  if (!await getEvent(db, `gvx-credit-claim:${key}`, scope)) await appendClaim({ db, input, receipt, key });
  try {
    const plasticity = await recordAgowCredit(input, receipt);
    if (plasticity?.recorded !== true) throw retryableError(plasticity?.reason || 'agow-credit-not-recorded');
    const supportCount = await recordAppliedCredit({ db, input, receipt, key });
    const consolidation = await consolidateAfterSupport(input, receipt, supportCount);
    return { credited: true, supportCount, plasticity, consolidation };
  } catch (error) {
    await recordFailure({ db, input, receipt, error });
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
    evidenceStatus: 'verified', signedReceipt: input.signedReceipt, scope: input.scope,
    entityId: input.entityId, receiptId: receipt.receiptId, evidenceRefs: receipt.evidenceRefs
  });
}

async function recordAppliedCredit({ db, input, receipt, key }) {
  const scope = ledgerScope(input);
  if (!await getEvent(db, `gvx-credit-applied:${key}`, scope)) {
    await appendEvent(db, {
      id: `gvx-credit-applied:${key}`, ...input.scope, entityId: input.entityId,
      type: 'evidence_attached', payload: { kind: 'developmental_credit_applied',
        receiptId: receipt.receiptId, pathwayId: receipt.pathwayId,
        contextHash: receipt.contextHash || 'global', verifierId: receipt.verifierId,
        success: receipt.success }
    });
  }
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
    scope: input.scope, entityId: input.entityId, receiptId: input.receiptId,
    pathwayId: input.pathwayId, contextHash: input.contextHash, success: input.success,
    predictionError: input.predictionError, reward: input.reward,
    evidenceRefs: input.evidenceRefs, signedReceipt: input.signedReceipt,
    key: `${receipt.pathwayId}:${receipt.contextHash || 'global'}`
  });
}

async function recordFailure({ db, input, receipt, error }) {
  try {
    await appendEvent(db, {
      ...input.scope, entityId: input.entityId,
      type: 'evidence_attached', payload: { kind: 'developmental_credit_failed',
        receiptId: receipt.receiptId, retryable: true, reason: error.code || 'credit-failed' }
    });
  } catch (_) { /* The immutable claim remains available for an idempotent retry. */ }
}

function retryableError(reason) {
  return Object.assign(new Error(`GVX credit can be retried: ${reason}`), { code: 'GVX_CREDIT_RETRYABLE' });
}

function validateRequest(input) {
  if (!validReceiptRequest(input)) {
    throw Object.assign(new Error('Signed GVX receipt and claim are required.'), { code: 'GVX_RECEIPT_VERIFIER_REQUIRED' });
  }
}

function validReceiptRequest(input) {
  return Boolean(input && validReceiptScope(input) && input.entityId && input.agentId
    && input.receiptId && input.db && input.signedReceipt && input.pathwayId
    && typeof input.success === 'boolean' && Number.isFinite(input.predictionError));
}

function validReceiptScope(input) {
  return Boolean(input.scope?.organizationId && input.scope?.projectId);
}

function creditKey(input, receipt) {
  const tuple = [input.scope.organizationId, input.scope.projectId, input.entityId, receipt.receiptId].join('\0');
  return crypto.createHash('sha256').update(tuple).digest('hex');
}

function ledgerScope(input) { return { ...input.scope, entityId: input.entityId }; }

module.exports = { creditVerifiedReceipt };
