'use strict';

const INTERPRETIVE_STATUSES = new Set(['interpretive', 'disputed']);

function list(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeConcept(item) {
  if (typeof item === 'string') return { id: item, status: 'unknown', provenance: null, mapping: null };
  if (!item || typeof item !== 'object') return null;
  return {
    id: String(item.id || item.concept || item.conceptId || '').trim(),
    status: String(item.status || 'unknown').trim(),
    provenance: item.provenance || null,
    mapping: item.mapping || null,
    version: item.provenance?.version || null,
  };
}

function hasProvenance(concept) {
  return Boolean(concept.provenance && typeof concept.provenance === 'object' && (
    concept.provenance.version && (concept.provenance.sourceDocument || concept.provenance.sourceLocator || concept.provenance.sourceType)
  ));
}

function normalizeContext(input = {}) {
  const source = input.philosophyContext || input.philosophy_context || input;
  const concepts = list(source.concepts || source).map(normalizeConcept).filter((concept) => concept && concept.id);
  const interpretiveConcepts = concepts.filter((concept) => (
    INTERPRETIVE_STATUSES.has(concept.status) || concept.mapping?.kind === 'analogy'
  ));
  const missingProvenance = concepts.filter((concept) => !hasProvenance(concept));
  const interpretive = Boolean(source.interpretive) || interpretiveConcepts.length > 0;
  return {
    concepts,
    interpretive,
    interpretiveConcepts: interpretiveConcepts.map((concept) => concept.id),
    missingProvenance: missingProvenance.map((concept) => concept.id),
    provenanceComplete: missingProvenance.length === 0 && concepts.length > 0,
    requireIndependentVerification: interpretive,
    requireHumanApproval: interpretive,
    requireProvenance: interpretive || missingProvenance.length > 0,
    holdPromotion: interpretive,
  };
}

function verifiedPhilosophyEvidence(context = {}) {
  if (context.philosophyEvidence === true || context.philosophyProvenanceVerified === true) return true;
  const report = context.report || {};
  if (report.philosophy?.provenanceVerified === true) return true;
  const evidence = Array.isArray(report.philosophicalEvidence) ? report.philosophicalEvidence : [];
  return evidence.length > 0 && evidence.every((item) => (
    item?.provenance?.version && item.provenance.evidenceStatus !== 'unverified'
  ));
}

function buildPromotionPolicy(context = {}) {
  const normalized = normalizeContext(context);
  return {
    ...normalized,
    promotionRequirements: {
      independentVerification: normalized.requireIndependentVerification,
      humanApproval: normalized.requireHumanApproval,
      provenance: normalized.requireProvenance,
    },
  };
}

function evaluatePromotionContext(contract = {}, executionContext = {}) {
  const policy = contract.philosophy_context || null;
  if (!policy) return [];
  const violations = [];
  if (policy.holdPromotion && !verifiedPhilosophyEvidence(executionContext)) {
    violations.push({
      policy: 'philosophy_provenance',
      message: 'Interpretive philosophical context requires verified provenance before promotion.',
    });
  }
  if (policy.requireProvenance && !policy.provenanceComplete && !verifiedPhilosophyEvidence(executionContext)) {
    violations.push({
      policy: 'philosophy_context_provenance',
      message: `Philosophical context has incomplete provenance: ${(policy.missingProvenance || []).join(', ') || 'unknown concepts'}.`,
    });
  }
  return violations;
}

function memoryMetadata(input = {}) {
  const policy = buildPromotionPolicy(input);
  return {
    concepts: policy.concepts.map((concept) => concept.id),
    interpretive: policy.interpretive,
    provenanceComplete: policy.provenanceComplete,
    status: policy.interpretive ? 'interpretive' : 'descriptive',
    promotionHeld: policy.holdPromotion,
  };
}

module.exports = {
  buildPromotionPolicy,
  evaluatePromotionContext,
  memoryMetadata,
  normalizeContext,
};
