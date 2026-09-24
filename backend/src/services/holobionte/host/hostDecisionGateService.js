'use strict';

const { getSession, appendEvent } = require('../holobiontStore');
const constitutionService = require('./hostConstitutionService');
const immunePlane = require('../immune/holobiontImmunePlane');
const signatures = require('../../promotionSignatureService');

function gateError(message, code = 'HOLOBIONT_DECISION_INVALID') {
  return Object.assign(new Error(message), { code });
}

function text(value, field) {
  const normalized = String(value || '').trim();
  if (!normalized) throw gateError(`${field} is required.`);
  return normalized;
}

function verifyApproval(input) {
  const receipt = input.overrideReceipt;
  if (!receipt || !['SYSTEM', 'USER'].includes(receipt.approvedBy)) return false;
  const decisionId = text(receipt.decisionId, 'override decisionId');
  const resultHash = text(receipt.resultHash, 'override resultHash');
  if (decisionId !== input.decisionId || resultHash !== input.resultHash) return false;
  if (!text(receipt.reason, 'override reason')) return false;
  const timestamp = Number(receipt.timestamp);
  if (!Number.isFinite(timestamp) || timestamp > Date.now() || Date.now() - timestamp > 300000) return false;
  const signerId = text(receipt.signerId, 'override signerId');
  try {
    return signatures.validateSignature({ runId: `${decisionId}:${resultHash}`, timestamp, signerId }, receipt.signature);
  } catch (_) {
    return false;
  }
}

async function authorizeHostDecision(db, input = {}) {
  const session = await getSession(db, input.holobiontId);
  if (!session) throw gateError('Holobiont session not found.', 'HOLOBIONT_SESSION_NOT_FOUND');
  if (Number(input.expectedSessionRevision) !== session.revision) {
    throw gateError('Holobiont session revision conflict.', 'HOLOBIONT_REVISION_CONFLICT');
  }
  if (!session.constitution) throw gateError('Host constitution is required.', 'HOLOBIONT_CONSTITUTION_REQUIRED');
  const authority = constitutionService.authorizeHostDecision({
    constitution: session.constitution, requestedAuthority: input.requestedAuthority,
    changedInvariants: input.changedInvariants
  });
  const immuneReview = await immunePlane.reviewSymbiontOutput({
    symbiontId: session.hostId, claim: input.claim, resultHash: input.resultHash,
    evidenceRefs: input.evidenceRefs, verifierId: input.verifierId,
    riskScore: input.riskScore, selfVerified: input.selfVerified === true
  });
  if (!immuneReview.blocked) return { allowed: true, authority, immuneReview, overridden: false };
  return applyPolicyOverride(db, { input, session, authority, immuneReview });
}

async function applyPolicyOverride(db, context) {
  const { input, session, authority, immuneReview } = context;
  if (!verifyApproval(input)) {
    return { allowed: false, reason: 'POLICY_VETO', authority, immuneReview, overridden: false };
  }
  const receipt = input.overrideReceipt;
  const revision = await appendEvent(db, {
    holobiontId: session.holobiontId, eventType: 'IMMUNE_OVERRIDE',
    expectedRevision: session.revision, actorId: receipt.signerId,
    payload: { decisionId: receipt.decisionId, resultHash: receipt.resultHash,
      approvedBy: receipt.approvedBy, reason: receipt.reason, immuneReview }
  });
  return { allowed: true, authority, immuneReview, overridden: true, sessionRevision: revision };
}

module.exports = { authorizeHostDecision, verifyApproval };
