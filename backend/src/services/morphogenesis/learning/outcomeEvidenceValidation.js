'use strict';

const crypto = require('node:crypto');

const ADMISSIBLE_EVIDENCE_KINDS = new Set([
  'oracle', 'benchmark', 'deterministic_verifier', 'human_approval', 'external_metric'
]);

function validate(evidence) {
  if (!validEvidenceFields(evidence)) return false;
  const receipt = evidence.receipt;
  if (!validReceiptFields(receipt, evidence.receiptId)) return false;
  if (receipt.evidenceDigest !== evidenceDigest(evidence)) return false;
  return trustedReceipt(receipt);
}

function validEvidenceFields(evidence) {
  return Boolean(evidence && evidence.status === 'VERIFIED'
    && ADMISSIBLE_EVIDENCE_KINDS.has(evidence.kind)
    && String(evidence.receiptId || '').trim()
    && typeof evidence.success === 'boolean'
    && validValue(evidence.value));
}

function validValue(value) {
  const score = Number(value);
  return Number.isFinite(score) && score >= 0 && score <= 1;
}

function validReceiptFields(receipt, receiptId) {
  return Boolean(receipt && receipt.resultId === receiptId && receipt.independent === true
    && ['verified', 'passed', 'VERIFIED', 'PASS'].includes(receipt.status));
}

function evidenceDigest(evidence) {
  const payload = { success: evidence.success, value: Number(evidence.value), kind: evidence.kind };
  if (evidence.learningContext) payload.learningContext = evidence.learningContext;
  return crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

function validateLearningEvidence(evidence) {
  if (!validate(evidence)) return false;
  return validLearningContext(evidence.learningContext);
}

function validLearningContext(context) {
  return validProblemSignature(context) && validInitialMorphology(context)
    && validLearningEnvironment(context) && validLearningBudget(context);
}

function validProblemSignature(context) {
  return Boolean(context && typeof context.problemSignature === 'string' && context.problemSignature.trim());
}

function validInitialMorphology(context) {
  return Boolean(context?.initialMorphology && typeof context.initialMorphology === 'object'
    && typeof context.initialMorphology.topology === 'string');
}

function validLearningEnvironment(context) {
  return Boolean(context?.environment && context.model && context.harness);
}

function validLearningBudget(context) {
  return Boolean(context?.budget && typeof context.budget === 'object');
}

function trustedReceipt(receipt) {
  try {
    const trust = require('../../verifierTrustRegistry');
    const receipts = require('../../epistemicVerifierReceiptService');
    return receipts.validateReceipt(receipt, trust.resolveTrustedVerifierDigests({}));
  } catch (_) {
    return false;
  }
}

module.exports = { validate, validateLearningEvidence, evidenceDigest, ADMISSIBLE_EVIDENCE_KINDS };
