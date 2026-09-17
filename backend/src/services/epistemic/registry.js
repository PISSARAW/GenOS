'use strict';

/**
 * Claim type registry with provable causal provenance.
 *
 * Point 2 — Claims carry provable provenance, not only typed statements.
 *
 * Every claim type registered here declares:
 *  - its epistemic category (evidence / norm / preference / belief)
 *  - the kinds of evidence it typically rests on
 *  - its requirement (what makes a claim of that type admissible)
 *  - provenance metadata: who registered it, when, version, supersession chain
 *
 * The registry is frozen by default. Mutation is an explicit governance action.
 */

const {
  CLAIM_TYPES,
  EVIDENCE_KINDS,
} = require('./claimTypes');

// ---------------------------------------------------------------------------
// Base registry — extended in core.js with metadata + provenance
// ---------------------------------------------------------------------------

const BASE_REGISTRY = Object.freeze({
  [CLAIM_TYPES.FACTUAL]: Object.freeze({
    type: CLAIM_TYPES.FACTUAL,
    category: 'evidence',
    description: 'Assertion grounded in observation, test, replay, or artifact.',
    typicalEvidenceKinds: [
      EVIDENCE_KINDS.OBSERVATION,
      EVIDENCE_KINDS.TEST_RESULT,
      EVIDENCE_KINDS.REPLAY,
      EVIDENCE_KINDS.ARTIFACT,
    ],
    requirement: 'Must be falsifiable in principle.',
  }),
  [CLAIM_TYPES.NORMATIVE]: Object.freeze({
    type: CLAIM_TYPES.NORMATIVE,
    category: 'norm',
    description: 'Value-loaded assertion about what should hold.',
    typicalEvidenceKinds: [
      EVIDENCE_KINDS.APPROVAL,
      EVIDENCE_KINDS.LOG,
      EVIDENCE_KINDS.ARTIFACT,
    ],
    requirement: 'Must name its authority or principle.',
  }),
  [CLAIM_TYPES.PREFERENCE]: Object.freeze({
    type: CLAIM_TYPES.PREFERENCE,
    category: 'preference',
    description: 'Agent or stakeholder preference, not universal.',
    typicalEvidenceKinds: [EVIDENCE_KINDS.APPROVAL, EVIDENCE_KINDS.LOG],
    requirement: 'Must identify whose preference it is.',
  }),
  [CLAIM_TYPES.BELIEF]: Object.freeze({
    type: CLAIM_TYPES.BELIEF,
    category: 'belief',
    description: 'Held position without full verification; provisional.',
    typicalEvidenceKinds: [
      EVIDENCE_KINDS.RECONSTRUCTION,
      EVIDENCE_KINDS.OBSERVATION,
      EVIDENCE_KINDS.LOG,
    ],
    requirement: 'Must be flagged provisional and tracked for debt.',
  }),
});

// ---------------------------------------------------------------------------
// Provenance helpers
// ---------------------------------------------------------------------------

const PROVENANCE_BY = 'genos-epistemic-core';
const PROVENANCE_AT = '2026-09-16';
const PROVENANCE_VERSION = 1;

function provenanceMeta(supersedes = null) {
  return Object.freeze({
    registeredBy: PROVENANCE_BY,
    registeredAt: PROVENANCE_AT,
    version: PROVENANCE_VERSION,
    supersedes,
  });
}

// ---------------------------------------------------------------------------
// Metadata per type — stable, inspectable, serializable as JSON-LD @context
// ---------------------------------------------------------------------------

function metadataFor(type) {
  const base = BASE_REGISTRY[type];
  if (!base) return null;
  return Object.freeze({
    '@context': 'genos://epistemic/v1/claim-type',
    type: base.type,
    category: base.category,
    description: base.description,
    typicalEvidenceKinds: base.typicalEvidenceKinds,
    requirement: base.requirement,
    provenance: provenanceMeta(),
  });
}

// ---------------------------------------------------------------------------
// Registry inspection API
// ---------------------------------------------------------------------------

function registryEntry(type) {
  return BASE_REGISTRY[type] || null;
}

function registryCategory(type) {
  const entry = BASE_REGISTRY[type];
  return entry ? entry.category : null;
}

function registryTypicalEvidenceKinds(type) {
  const entry = BASE_REGISTRY[type];
  return entry ? entry.typicalEvidenceKinds : null;
}

function registryRequirement(type) {
  const entry = BASE_REGISTRY[type];
  return entry ? entry.requirement : null;
}

function registryHasType(type) {
  return type in BASE_REGISTRY;
}

function registryAllTypes() {
  return Object.keys(BASE_REGISTRY);
}

// ---------------------------------------------------------------------------
// Registry is frozen; mutation would be an explicit governance action
// (ADR + review). This function is a guard, not an open door.
// ---------------------------------------------------------------------------

function extendRegistry(entry, opts = {}) {
  if (!entry || !entry.type || !entry.description) return null;
  if (opts.governanceToken !== process.env.GENOS_GOVERNANCE_TOKEN) {
    return null; // silent refusal — no error, no mutation
  }
  // In the current implementation, the registry is frozen. Real extension
  // would require an ADR + a new version registration.
  return null;
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  BASE_REGISTRY,
  metadataFor,
  registryEntry,
  registryCategory,
  registryTypicalEvidenceKinds,
  registryRequirement,
  registryHasType,
  registryAllTypes,
  extendRegistry,
  provenanceMeta,
  PROVENANCE_BY,
  PROVENANCE_AT,
  PROVENANCE_VERSION,
};
