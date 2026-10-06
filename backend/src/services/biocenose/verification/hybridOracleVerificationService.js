'use strict';

const verifierRouter = require('./verifierRouter');

async function routeAndVerify(input) {
  const { context, session, claim, receipts } = input;
  const verificationClaim = { ...(claim.claim || claim), claimId: claim.claimId || claim.claim?.claimId };
  assertMixedClaimType(context, session, verificationClaim);
  const verification = verifierRouter.route({ claim: verificationClaim, members: session.members });
  assertRequiredVerifier({ context, session, verification, claim: verificationClaim });
  const required = requiresVerification(context, session, verificationClaim);
  if (!required && (!verification.deterministicAvailable || typeof context.verificationExecutor !== 'function')) return;
  if (typeof context.verificationExecutor !== 'function') {
    throw requiredReceipt('A deterministic verifier executor is required for this factual claim.');
  }
  await collectReceipts({ context, session, claim: verificationClaim, verification, receipts });
  if (required && !receipts.some((receipt) => receipt.claimId === verificationClaim.claimId)) {
    throw requiredReceipt('A trusted verified receipt is required for this factual claim.');
  }
}

async function collectReceipts(input) {
  const { context, session, claim, verification, receipts } = input;
  for (const verifier of verification.verifiers) {
    const receipt = await context.verificationExecutor({ claim, verifier, communityId: session.communityId });
    if (isBoundReceipt(receipt, claim, verifier) && isTrustedVerifiedReceipt(receipt, context.isTrustedReceipt)) {
      receipts.push({ ...receipt, claimId: claim.claimId, verifierId: verifier.memberId });
    }
  }
}

function assertMixedClaimType(context, session, claim) {
  if (!context.variantPolicy?.requireDeterministicVerifier || session.questionType !== 'MIXED') return;
  const knownTypes = new Set(['FACT', 'FACTUAL', 'MATH', 'CODE', 'SECURITY', 'INTERPRETIVE', 'NORMATIVE', 'DESIGN', 'EXPLORATORY', 'PROBABILISTIC', 'FORECAST', 'MULTI_CRITERIA']);
  if (!knownTypes.has(String(claim.type || '').toUpperCase())) {
    throw Object.assign(new Error('Hybrid Oracle requires every MIXED claim to be explicitly typed before routing.'), {
      code: 'BIOCENOSE_VARIANT_CLAIM_TYPE_REQUIRED'
    });
  }
}

function isBoundReceipt(receipt, claim, verifier) {
  return receipt && (!receipt.claimId || receipt.claimId === claim.claimId)
    && (!receipt.verifierId || receipt.verifierId === verifier.memberId);
}

function assertRequiredVerifier({ context, session, verification, claim }) {
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

module.exports = { routeAndVerify, assertRequiredVerifier, requiresVerification, assertMixedClaimType };
