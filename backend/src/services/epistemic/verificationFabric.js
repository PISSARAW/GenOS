'use strict';

const { validateReceipt } = require('../epistemicVerifierReceiptService');

const RESULTS = Object.freeze(['VERIFIED', 'REFUTED', 'INCONCLUSIVE', 'UNAVAILABLE']);
const DECISIONS = Object.freeze(['PROMOTE', 'REJECT', 'REVISE', 'ESCALATE']);
const PRIORITY = Object.freeze([
  'formal_proof', 'exact_certificate', 'executable', 'structural',
  'empirical', 'grounded_source', 'independent_agent', 'llm_judgment',
]);

function nonEmpty(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function validClaimShape(claim) {
  return claim && nonEmpty(claim.id) && nonEmpty(claim.proposition)
    && nonEmpty(claim.domain) && nonEmpty(claim.scope) && Boolean(claim.producer);
}

function validateClaim(claim) {
  if (!validClaimShape(claim)) {
    throw new TypeError('Claim requires id, proposition, domain, scope, and producer.');
  }
  return Object.freeze({
    id: claim.id,
    proposition: claim.proposition,
    domain: claim.domain,
    scope: claim.scope,
    producer: claim.producer,
    assumptions: Array.isArray(claim.assumptions) ? [...claim.assumptions] : [],
    dependencies: Array.isArray(claim.dependencies) ? [...claim.dependencies] : [],
    requestedAssurance: claim.requestedAssurance || 'empirical',
    evidenceDigest: claim.evidenceDigest || null,
  });
}

function verifierPriority(verifier) {
  const level = verifier.verificationClass || 'independent_agent';
  const index = PRIORITY.indexOf(level);
  return index < 0 ? PRIORITY.indexOf('independent_agent') : index;
}

function executableVerifier(verifier) {
  return verifier && verifier.id && verifier.type && verifier.verificationClass !== 'llm_judgment';
}

function createVerificationPlan(claim, verifiers, options = {}) {
  const validatedClaim = validateClaim(claim);
  const ordered = (Array.isArray(verifiers) ? verifiers : [])
    .filter(executableVerifier)
    .slice().sort((a, b) => verifierPriority(a) - verifierPriority(b));
  return Object.freeze({
    claimId: validatedClaim.id,
    verifiers: ordered.map((v) => ({ id: v.id, type: v.type, verificationClass: v.verificationClass || 'independent_agent' })),
    independenceRequirements: options.independenceRequirements || { independentOfProducer: true },
    requiredEvidenceTypes: Array.isArray(options.requiredEvidenceTypes) ? [...options.requiredEvidenceTypes] : [],
    successPolicy: options.successPolicy || { minVerified: 1, requireIndependent: true },
    failurePolicy: options.failurePolicy || 'reject_on_refutation',
    inconclusivePolicy: options.inconclusivePolicy || 'revise',
    budget: options.budget || {},
  });
}

function canonicalResult(status) {
  if (status === 'verified') return 'VERIFIED';
  if (status === 'refuted') return 'REFUTED';
  if (status === 'error' || status === 'unavailable' || status === 'no_verifier') return 'UNAVAILABLE';
  return 'INCONCLUSIVE';
}

function receiptEvidence(result) {
  const evidence = [];
  for (const item of result.observations || []) evidence.push({ type: 'observation', value: item });
  for (const item of result.counterexamples || []) evidence.push({ type: 'counterexample', value: item });
  return evidence;
}

function validAeisBinding(claim, signed, trustedVerifierDigests) {
  return Boolean(claim && claim.evidenceDigest && signed
    && signed.resultId === claim.id
    && signed.evidenceDigest === claim.evidenceDigest
    && validateReceipt(signed, trustedVerifierDigests));
}

function unavailableReceipt(claim, result) {
  return {
    claimId: claim?.id || null,
    verifierId: result?.verifierId || result?.verifierDigest || 'unknown',
    verifierDigest: result?.verifierDigest || null,
    method: result?.method || 'aeis_adapter',
    result: 'UNAVAILABLE', evidence: [], assumptions: [], limitations: ['AEIS signature, trust, or claim binding is invalid.'],
    reproducibility: { reproducible: false },
  };
}

function verifiedReceipt(claim, result, signed) {
  const canonical = canonicalResult(signed.status);
  return {
    claimId: claim.id,
    verifierId: result.verifierId || signed.verifierDigest,
    verifierDigest: signed.verifierDigest,
    method: result.method || 'aeis_adapter',
    result: canonical,
    evidence: receiptEvidence(result),
    evidenceTypes: Array.isArray(signed.evidenceTypes) ? [...signed.evidenceTypes] : [],
    counterexample: canonical === 'REFUTED' ? (result.counterexamples || [])[0] || null : null,
    assumptions: Array.isArray(result.assumptions) ? result.assumptions : [],
    limitations: Array.isArray(result.limitations) ? result.limitations : [],
    reproducibility: { reproducible: Boolean(result.reproducible), checkedAt: signed.checkedAt },
    aeisReceipt: signed,
  };
}

function normalizeAeisReceipt(claim, result, trustedVerifierDigests = []) {
  const signed = result && result.receipt;
  if (!validAeisBinding(claim, signed, trustedVerifierDigests)) return unavailableReceipt(claim, result);
  return verifiedReceipt(claim, result, signed);
}

function selectDecision(receipts, plan) {
  if (receipts.some((r) => r.result === 'REFUTED')) return 'REJECT';
  const required = Math.max(1, Number(plan.successPolicy?.minVerified) || 1);
  const requiredEvidence = plan.requiredEvidenceTypes || [];
  const passing = receipts.filter((r) => r.result === 'VERIFIED'
    && (!plan.successPolicy?.requireIndependent || r.aeisReceipt?.independent === true)
    && requiredEvidence.every((type) => r.aeisReceipt?.evidenceTypes?.includes(type)));
  if (passing.length >= required) return 'PROMOTE';
  if (receipts.some((r) => r.result === 'UNAVAILABLE')) return 'ESCALATE';
  return plan.inconclusivePolicy === 'escalate' ? 'ESCALATE' : 'REVISE';
}

function receiptBindsClaim(receipt, claim, trustedVerifierDigests) {
  const signed = receipt?.aeisReceipt;
  return receipt?.claimId === claim.id
    && RESULTS.includes(receipt.result)
    && signed?.resultId === claim.id
    && signed?.evidenceDigest === claim.evidenceDigest
    && receipt.verifierDigest === signed.verifierDigest
    && canonicalResult(signed.status) === receipt.result
    && validateReceipt(signed, trustedVerifierDigests);
}

function decidePromotion(claim, plan, context = {}) {
  const checkedClaim = validateClaim(claim);
  if (!plan || plan.claimId !== checkedClaim.id) throw new TypeError('Verification plan is not bound to claim.');
  const receipts = Array.isArray(context.receipts) ? context.receipts : [];
  const trustedVerifierDigests = Array.isArray(context.trustedVerifierDigests)
    ? context.trustedVerifierDigests : [];
  const bound = receipts.filter((r) => receiptBindsClaim(r, checkedClaim, trustedVerifierDigests));
  const status = selectDecision(bound, plan);
  return {
    claimId: checkedClaim.id,
    status: DECISIONS.includes(status) ? status : 'ESCALATE',
    receipts: bound,
    decisionRule: 'trusted signed AEIS receipts; refutation veto; independent verified receipts required by plan',
    llmWasJudge: false,
  };
}

module.exports = { RESULTS, DECISIONS, PRIORITY, validateClaim, createVerificationPlan, normalizeAeisReceipt, decidePromotion };
