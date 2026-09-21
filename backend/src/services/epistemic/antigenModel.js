'use strict';

/**
 * Antigène épistémique.
 * Unité biologique qui rassemble affirmation, épicats (hypothèses, preuve,
 * domaine de validité, dépendances, provenance) et le contexte de production.
 */

const { createFormalResult } = require('../formalResultService');
const { digest } = require('../formalResultService');

const PASSED = new Set(['passed', 'verified']);

// ---- identité ----

function antigenId() {
  const now = Date.now();
  const rand = Math.random().toString(36).slice(2, 10);
  return `ag-${now}-${rand}`;
}

// ---- épitopes ----

function epitopeAssumptions(formalResult, input) {
  const raw = input.assumptions || (formalResult ? formalResult.assumptions : null);
  return Array.isArray(raw) ? raw : [];
}

function epitopeEvidence(formalResult, input) {
  return input.evidence || (formalResult ? formalResult.evidence : null) || null;
}

function epitopeValidityDomain(formalResult, input) {
  return input.validityDomain || (formalResult ? formalResult.validityDomain : null) || null;
}

function epitopeDependencies(formalResult, input) {
  const raw = input.dependencies || (formalResult ? formalResult.dependencies : null);
  return Array.isArray(raw) ? raw : [];
}

function epitopeProvenance(formalResult, input) {
  return input.provenance || (formalResult ? formalResult.provenance : null) || null;
}

// ---- compositeurs ----

function buildClaim(claim, formalResult) {
  return claim || (formalResult ? formalResult.canonicalStatement : '') || '(sans affirmation)';
}

function buildProducer(producer, formalResult) {
  return producer || (formalResult ? formalResult.producer : null) || { model: 'unknown', version: 'unknown' };
}

function buildMeta(formalResult) {
  return {
    assembledAt: new Date().toISOString(),
    formalResultId: formalResult ? formalResult.resultId : null,
  };
}

// ---- point d'entrée ----

function toAntigen(input = {}) {
  const formalResult = input.formalResult || null;
  return {
    id: antigenId(),
    claim: buildClaim(input.claim, formalResult),
    epitopes: {
      assumptions: epitopeAssumptions(formalResult, input),
      evidence: epitopeEvidence(formalResult, input),
      validityDomain: epitopeValidityDomain(formalResult, input),
      dependencies: epitopeDependencies(formalResult, input),
      provenance: epitopeProvenance(formalResult, input),
    },
    producer: buildProducer(input.producer, formalResult),
    risk: computeRisk(input, formalResult),
    state: 'unrecognized',
    meta: buildMeta(formalResult),
  };
}

// ---- risque ----

function evidenceSignal(payload) {
  if (!payload.evidence) {
    return { pattern: 'EMPTY_EVIDENCE', danger: 0.75, weight: 1 };
  }
  if (!payload.evidence.digest) {
    return { pattern: 'NO_DIGEST', danger: 0.6, weight: 1 };
  }
  return null;
}

function provenanceSignal(payload) {
  if (!payload.provenance || !payload.provenance.source) {
    return { pattern: 'NO_PROVENANCE', danger: 0.65, weight: 1 };
  }
  if (payload.provenance.selfVerified) {
    return { pattern: 'SELF_VERIFICATION', danger: 0.9, weight: 2 };
  }
  return null;
}

function assumptionsSignals(assumptions) {
  if (!Array.isArray(assumptions)) return [];
  if (assumptions.length === 0) {
    return [{ pattern: 'NO_ASSUMPTIONS', danger: 0.4, weight: 1 }];
  }
  if (assumptions.length > 8) {
    return [{ pattern: 'OVERCONSTRAINT', danger: 0.35, weight: 0.5 }];
  }
  return [];
}

function domainSignal(validityDomain) {
  if (!validityDomain || !validityDomain.constraints) return null;
  if (validityDomain.constraints.length === 0) {
    return { pattern: 'EMPTY_DOMAIN', danger: 0.3, weight: 0.5 };
  }
  return null;
}

function collectRiskSignals(payload) {
  return [
    evidenceSignal(payload),
    provenanceSignal(payload),
    ...assumptionsSignals(payload.assumptions),
    domainSignal(payload.validityDomain),
  ].filter(Boolean);
}

function aggregateRisk(signals) {
  const total = signals.reduce((sum, s) => sum + s.danger * s.weight, 0);
  const maxWeight = signals.reduce((sum, s) => sum + s.weight, 0) || 1;
  return {
    score: Math.min(1, total / Math.max(1, maxWeight)),
    signals,
    summary: summarizeRisk(signals),
  };
}

function computeRisk(input, formalResult) {
  const payload = {
    claim: input.claim || (formalResult ? formalResult.canonicalStatement : ''),
    evidence: epitopeEvidence(formalResult, input),
    assumptions: epitopeAssumptions(formalResult, input),
    validityDomain: epitopeValidityDomain(formalResult, input),
    provenance: epitopeProvenance(formalResult, input),
    producer: buildProducer(input.producer, formalResult),
  };
  return aggregateRisk(collectRiskSignals(payload));
}

// ---- agrégation ----

function summarizeRisk(signals) {
  if (signals.length === 0) return 'no réel';
  const byPattern = {};
  for (const s of signals) {
    byPattern[s.pattern] = (byPattern[s.pattern] || 0) + s.weight;
  }
  const worst = signals.reduce((a, b) => (a.danger > b.danger ? a : b), signals[0]);
  return {
    worstPattern: worst.pattern,
    worstDanger: worst.danger,
    count: signals.length,
    byPattern,
  };
}

// ---- machine à états ----

const STATE_ORDER = ['unrecognized', 'tolerated', 'challenged', 'quarantined', 'neutralized', 'verified'];

const STATE_TRANSITIONS = Object.freeze({
  unrecognized: ['tolerated', 'challenged', 'quarantined'],
  tolerated: ['challenged', 'quarantined', 'verified'],
  challenged: ['quarantined', 'neutralized', 'verified', 'tolerated'],
  quarantined: ['neutralized', 'challenged', 'tolerated'],
  neutralized: ['verified'],
  verified: ['verified'],
});

function stateTransition(current, event) {
  const idx = STATE_ORDER.indexOf(current);
  if (idx === -1) return current;
  const allowed = STATE_TRANSITIONS[current];
  if (!allowed.includes(event)) return current;
  return event;
}

// ---- clonage ----

function cloneAntigen(antigen, patch = {}) {
  return {
    ...antigen,
    ...patch,
    epitopes: { ...antigen.epitopes, ...(patch.epitopes || {}) },
    risk: patch.risk !== undefined ? patch.risk : antigen.risk,
    state: patch.state !== undefined ? patch.state : antigen.state,
    meta: { ...antigen.meta, ...(patch.meta || {}) },
  };
}

module.exports = {
  toAntigen,
  antigenId,
  computeRisk,
  summarizeRisk,
  stateTransition,
  cloneAntigen,
  PASSED,
};
