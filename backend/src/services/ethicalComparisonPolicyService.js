'use strict';

const REVIEW_STATUS = 'approved';

function list(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeComparison(input) {
  if (!input || typeof input !== 'object') return null;
  const provenance = input.provenance || {};
  const frameworkConcepts = list(provenance.frameworkConcepts);
  const evidenceRefs = list(provenance.evidenceRefs);
  const assumptions = list(provenance.assumptions);
  const interpretationStatus = input.interpretationStatus || 'interpretive';
  const evidenceStatus = input.evidenceStatus || (evidenceRefs.length ? 'documented' : 'unverified');
  const unresolvedConflicts = list(input.unresolvedConflicts);
  const requiresReview = input.humanReviewRequired !== false
    || input.decisionStatus !== REVIEW_STATUS
    || unresolvedConflicts.length > 0
    || interpretationStatus !== 'final';
  return {
    decisionStatus: input.decisionStatus || 'requires-human-judgment',
    interpretationStatus,
    evidenceStatus,
    frameworkConcepts,
    evidenceRefs,
    assumptions,
    unresolvedConflicts,
    provenanceHash: provenance.provenanceHash || input.provenanceHash || null,
    provenanceComplete: Boolean(provenance.provenanceHash && frameworkConcepts.length && evidenceRefs.length),
    requireHumanApproval: requiresReview,
    holdPromotion: requiresReview,
  };
}

function buildPromotionPolicy(comparison) {
  const normalized = normalizeComparison(comparison);
  if (!normalized) return null;
  return {
    ...normalized,
    requireProvenance: true,
    requireEthicalReview: normalized.requireHumanApproval,
  };
}

function reviewFrom(context = {}) {
  return context.ethicalReview || context.report?.ethicalReview || {};
}

function evaluatePromotionContext(contract = {}, executionContext = {}) {
  const comparison = contract.ethical_comparison || contract.ethicalComparison;
  const policy = comparison?.promotion || comparison;
  if (!policy) return [];
  const review = reviewFrom(executionContext);
  const violations = [];
  if (policy.requireProvenance && (!policy.provenanceComplete || policy.evidenceStatus === 'unverified')) {
    violations.push({
      policy: 'ethical_comparison_provenance',
      message: 'An ethical comparison requires a complete provenance hash and evidence references before promotion.',
    });
  }
  if (policy.requireEthicalReview && (review.status !== REVIEW_STATUS || review.provenanceVerified !== true || review.evidenceVerified !== true)) {
    violations.push({
      policy: 'ethical_comparison_interpretation',
      message: 'An interpretive or conflicting ethical comparison requires an approved review with verified evidence and provenance.',
    });
  }
  return violations;
}

function memoryMetadata(comparison) {
  const policy = buildPromotionPolicy(comparison);
  if (!policy) return null;
  return {
    decisionStatus: policy.decisionStatus,
    interpretationStatus: policy.interpretationStatus,
    evidenceStatus: policy.evidenceStatus,
    provenanceHash: policy.provenanceHash,
    frameworkConcepts: policy.frameworkConcepts,
    unresolvedConflicts: policy.unresolvedConflicts,
    promotionHeld: policy.holdPromotion,
  };
}

module.exports = { buildPromotionPolicy, evaluatePromotionContext, memoryMetadata, normalizeComparison };
