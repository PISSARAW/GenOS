'use strict';

const { createHash } = require('node:crypto');
const { canonicalize } = require('../governance/protocolVersioning');
const { validateReceipt } = require('../../epistemicVerifierReceiptService');
const { listVerifierDigests } = require('../../verifierTrustRegistry');
const verifierRouter = require('./verifierRouter');

function nonEmpty(value) { return typeof value === 'string' && Boolean(value.trim()); }

function claimBody(claim) {
  const { claimId, ...body } = claim?.claim || claim || {};
  return body;
}

function bindingDigest(input) {
  const { claim, receipt, session } = input;
  const material = { schemaVersion: 1, communityId: session.communityId,
    round: session.round, claimId: claim.claimId, claim: claimBody(claim),
    verifierId: receipt.verifierId, receiptId: receipt.receiptId,
    evidenceRef: receipt.evidenceRef };
  return createHash('sha256').update(JSON.stringify(canonicalize(material))).digest('hex');
}

function matchesScope(input) {
  const { claim, receipt, session, verifier } = input;
  return nonEmpty(claim?.claimId) && nonEmpty(verifier?.memberId)
    && nonEmpty(session?.communityId) && Number.isInteger(session.round)
    && nonEmpty(receipt?.receiptId) && nonEmpty(receipt.evidenceRef)
    && receipt.claimId === claim.claimId && receipt.verifierId === verifier.memberId
    && receipt.communityId === session.communityId && receipt.round === session.round;
}

function verify(input) {
  if (!matchesScope(input)) return false;
  const { receipt } = input;
  const signed = receipt.epistemicReceipt;
  if (!signed || signed.status !== 'verified' || signed.resultId !== receipt.receiptId
    || signed.evidenceDigest !== bindingDigest(input)) return false;
  return validateReceipt(signed, listVerifierDigests());
}

function eligibleVerifier(claim, member) {
  if (!member || member.status !== 'ACTIVE') return false;
  return verifierRouter.route({ claim: { ...claimBody(claim), claimId: claim.claimId },
    members: [member] }).deterministicAvailable;
}

function trustedForSession(input) {
  const { session, claims, receipts, isTrustedReceipt } = input;
  if (typeof isTrustedReceipt !== 'function') return [];
  const byClaim = new Map((claims || []).map((claim) => [claim.claimId, claim]));
  const byMember = new Map((session?.members || []).map((member) => [member.memberId, member]));
  return (receipts || []).filter((receipt) => {
    const claim = byClaim.get(receipt?.claimId);
    const verifier = byMember.get(receipt?.verifierId);
    if (!claim || !eligibleVerifier(claim, verifier) || !verify({ claim, receipt, session, verifier })) return false;
    try { return isTrustedReceipt(receipt) === true; } catch (_) { return false; }
  });
}

module.exports = { bindingDigest, verify, trustedForSession };
