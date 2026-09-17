'use strict';

const { validateRegistry } = require('../philosophy/conceptRegistry');

const INTERPRETIVE_STATUSES = new Set(['conceptual', 'provisional', 'contested']);

function referenceInput(item) {
  if (typeof item === 'string') return { conceptId: item };
  return item && typeof item === 'object' ? item : {};
}

function normalizeReference(item, concepts) {
  const input = referenceInput(item);
  const concept = concepts.get(String(input.conceptId || input.id || '').trim());
  if (!concept) throw new Error(`Unknown philosophical concept '${input.conceptId || input.id || ''}'.`);
  return {
    conceptId: concept.id,
    interpretationStatus: input.interpretationStatus || concept.provenance.interpretationStatus || 'conceptual',
    evidenceStatus: input.evidenceStatus || concept.provenance.evidenceStatus || 'documented',
    provenanceRefs: Array.isArray(input.provenanceRefs) ? input.provenanceRefs : [],
    provenanceVersion: input.provenanceVersion || concept.provenance.version || null,
    sourceType: input.sourceType || concept.provenance.sourceType || null,
    maturity: concept.serviceMaturity.level
  };
}

function buildContext(input = {}) {
  const source = Array.isArray(input) ? { references: input } : (input || {});
  const concepts = new Map(validateRegistry().concepts.map((concept) => [concept.id, concept]));
  const references = (source.references || source.concepts || []).map((item) => normalizeReference(item, concepts));
  const interpretive = references.filter((reference) => INTERPRETIVE_STATUSES.has(reference.interpretationStatus));
  return {
    references,
    interpretationStatus: interpretive.length ? 'interpretive' : 'none',
    provenanceHash: source.provenanceHash || null,
    policy: {
      interpretiveRequiresVerifiedEvidence: interpretive.length > 0,
      requireVersionedProvenance: references.some((reference) => !reference.provenanceVersion || !reference.sourceType)
    }
  };
}

function reportHasVerifiedClaims(report) {
  const claims = Array.isArray(report?.claims) ? report.claims : [];
  return claims.length > 0 && claims.every((claim) => Array.isArray(claim?.evidence) && claim.evidence.length > 0);
}

function hasIndependentSupport(context = {}) {
  return context.independentVerification === true
    || context.evidenceVerified === true
    || (Array.isArray(context.verifiedClaims) && context.verifiedClaims.length > 0)
    || reportHasVerifiedClaims(context.report);
}

function evaluatePromotion(contract = {}, executionContext = {}) {
  const philosophy = contract.philosophy || contract.philosophical_context;
  if (!philosophy?.references?.length || !philosophy.policy?.interpretiveRequiresVerifiedEvidence) return null;
  if (philosophy.policy.requireVersionedProvenance && !hasIndependentSupport(executionContext)) {
    return {
      policy: 'philosophy_context_provenance',
      message: 'Philosophical context requires versioned provenance before promotion.'
    };
  }
  if (hasIndependentSupport(executionContext)) return null;
  return {
    policy: 'interpretive_philosophy_requires_verified_evidence',
    message: 'An interpretive philosophical reference cannot promote a decision without independent verified evidence.'
  };
}

function memoryMetadata(philosophy) {
  if (!philosophy?.references?.length) return null;
  return {
    references: philosophy.references.map((reference) => reference.conceptId),
    interpretationStatus: philosophy.interpretationStatus,
    provenanceHash: philosophy.provenanceHash || null,
    versioned: philosophy.references.every((reference) => Boolean(reference.provenanceVersion && reference.sourceType))
  };
}

module.exports = { buildContext, evaluatePromotion, memoryMetadata, INTERPRETIVE_STATUSES };
