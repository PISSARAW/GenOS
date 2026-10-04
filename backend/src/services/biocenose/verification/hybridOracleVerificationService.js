'use strict';

const verifierRouter = require('./verifierRouter');

async function routeAndVerify(input) {
  const { context, session, claim, receipts } = input;
  const verificationClaim = { ...(claim.claim || claim), claimId: claim.claimId || claim.claim?.claimId };
  const verification = verifierRouter.route({ claim: verificationClaim, members: session.members });
  assertRequiredVerifier(context, session, verification, verificationClaim);
  if (!requiresVerification(context, session, verificationClaim)) return;
  if (typeof context.verificationExecutor !== 'function') {
    throw requiredReceipt('A deterministic verifier executor is required for this factual claim.');
  }
  for (const verifier of verification.verifiers) {
    const receipt = await context.verificationExecutor({ claim: verificationClaim, verifier, communityId: session.communityId });
    if (isTrustedVerifiedReceipt(receipt, context.isTrustedReceipt)) receipts.push({ ...receipt, claimId: verificationClaim.claimId });
  }
  if (!receipts.some((receipt) => receipt.claimId === verificationClaim.claimId)) {
    throw requiredReceipt('A trusted verified receipt is required for this factual claim.');
  }
}

function assertRequiredVerifier(context, session, verification, claim) {
  if (requiresVerification(context, session, claim) && !verification.deterministicAvailable) {
    throw requiredReceipt('Hybrid Oracle Community requires a deterministic verifier for factual claims.');
  }
}

function requiresVerification(context, session, claim) {
  if (!context.variantPolicy?.requireDeterministicVerifier) return false;
  const type = String(claim.type || '').toUpperCase();
  const factualType = ['FACT', 'FACTUAL', 'MATH', 'CODE', 'SECURITY'].includes(type);
  const declaredCheck = (claim.verification?.kinds || claim.verificationKinds || []).length > 0;
  return session.questionType === 'FACTUAL' || factualType || declaredCheck;
}

function isTrustedVerifiedReceipt(receipt, validator) {
  if (!receipt || receipt.status !== 'VERIFIED' || typeof validator !== 'function') return false;
  try { return validator(receipt) === true; } catch (_) { return false; }
}

function requiredReceipt(message) {
  return Object.assign(new Error(message), { code: 'BIOCENOSE_VARIANT_VERIFIER_REQUIRED' });
}

module.exports = { routeAndVerify, assertRequiredVerifier, requiresVerification };