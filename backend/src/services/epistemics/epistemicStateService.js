'use strict';

/**
 * Epistemic State Service — live knowledge state per agent.
 *
 * Orchestrates existing evidence/provenance services to provide a real-time
 * view of what an agent knows, believes, and is uncertain about.
 */

const {
  evidenceScore,
  extractEvidenceReport,
  hasDecisionEvidence,
  typedEvidenceSummary
} = require('../agentEvidenceService');
const {
  inspectEvent,
  evidencePresent,
  extractClaims,
  extractUnverifiedClaims
} = require('../hallucinationMonitoringService');
const { resolveProvenance } = require('../provenanceResolver');
const {
  validateClaim,
  evidenceQuality,
  confidenceFromEvidence
} = require('../epistemic/claimTypes');
const {
  createEpistemicDebt,
  getEpistemicDebts,
  resolveEpistemicDebt,
  DEBT_REASONS
} = require('../epistemic/core');
const {
  assessProbability,
  bayesUpdate
} = require('../probabilityService');

// ---------------------------------------------------------------------------
// In-memory epistemic state store (per agent)
// ---------------------------------------------------------------------------

const agentStates = new Map();

function ensureState(agentId) {
  if (!agentStates.has(agentId)) {
    agentStates.set(agentId, {
      agentId,
      claims: new Map(),
      uncertainties: [],
      knownUnknowns: [],
      evidenceHistory: [],
      contradictions: [],
      lastUpdated: null,
      totalObservations: 0,
      hallucinationSignals: 0,
      confidenceCalibration: { predicted: 0, actual: 0, gap: 0 }
    });
  }
  return agentStates.get(agentId);
}

function getClaimsArray(state) {
  return Array.from(state.claims.values());
}

// ---------------------------------------------------------------------------
// State assembly
// ---------------------------------------------------------------------------

function computeOverallConfidence(state) {
  const claims = getClaimsArray(state);
  if (claims.length === 0) return 0;
  const total = claims.reduce((sum, c) => sum + evidenceQuality(c), 0);
  return Number((total / claims.length).toFixed(3));
}

function computeUncertaintyScore(state) {
  const claims = getClaimsArray(state);
  if (claims.length === 0) return 1.0;
  const avgConfidence = computeOverallConfidence(state);
  const uncertaintyCount = state.uncertainties.length;
  const hallucinationPenalty = Math.min(0.3, state.hallucinationSignals * 0.05);
  const baseUncertainty = 1 - avgConfidence;
  return Number(Math.min(1, baseUncertainty + uncertaintyCount * 0.02 + hallucinationPenalty).toFixed(3));
}

function assembleEpistemicState(state) {
  const claims = getClaimsArray(state);
  return {
    agentId: state.agentId,
    overallConfidence: computeOverallConfidence(state),
    uncertaintyScore: computeUncertaintyScore(state),
    claimCount: claims.length,
    claims: claims.map((c) => ({
      id: c.id,
      type: c.type,
      statement: c.statement,
      evidenceQuality: evidenceQuality(c),
      confidence: confidenceFromEvidence(c),
      provenance: c.provenance || null,
      phase: c.phase || null
    })),
    uncertainties: state.uncertainties.slice(),
    knownUnknowns: state.knownUnknowns.slice(),
    contradictionCount: state.contradictions.length,
    hallucinationSignals: state.hallucinationSignals,
    totalObservations: state.totalObservations,
    calibration: { ...state.confidenceCalibration },
    lastUpdated: state.lastUpdated
  };
}

// ---------------------------------------------------------------------------
// Evidence ingestion
// ---------------------------------------------------------------------------

function ingestEvidenceEntry(state, evidence) {
  const claim = normalizeClaim(evidence);
  if (!claim) return { ingested: false, reason: 'Invalid evidence format' };

  state.claims.set(claim.id, claim);
  state.totalObservations += 1;

  const hallucination = inspectEvent({
    eventType: 'EVIDENCE_INGESTED',
    payload: { claims: [claim] },
    agentId: state.agentId
  });
  if (hallucination.detected) {
    state.hallucinationSignals += hallucination.count;
  }

  state.lastUpdated = new Date().toISOString();
  return { ingested: true, claimId: claim.id };
}

function normalizeClaim(evidence) {
  if (evidence && typeof evidence === 'object' && evidence.id && evidence.type) {
    return evidence;
  }
  if (evidence && typeof evidence === 'object' && evidence.statement) {
    return {
      id: evidence.id || `claim-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      type: evidence.type || 'belief',
      statement: evidence.statement,
      evidence: Array.isArray(evidence.evidence) ? evidence.evidence : [],
      provenance: evidence.provenance || null,
      phase: evidence.phase || null
    };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Uncertainty tracking
// ---------------------------------------------------------------------------

function trackUncertainty(state, topic, score, note) {
  const uncertainty = {
    id: `unc-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    topic,
    score: Number(score.toFixed(3)),
    note: note || null,
    createdAt: new Date().toISOString(),
    resolved: false
  };
  state.uncertainties.push(uncertainty);
  return uncertainty;
}

function trackKnownUnknown(state, topic, note) {
  const known = {
    id: `ku-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    topic,
    note: note || null,
    createdAt: new Date().toISOString()
  };
  state.knownUnknowns.push(known);
  return known;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

function getState(agentId) {
  if (!agentId) return null;
  const state = ensureState(agentId);
  return assembleEpistemicState(state);
}

function updateState(agentId, evidence) {
  if (!agentId) return { updated: false, reason: 'agentId required' };
  const state = ensureState(agentId);

  if (Array.isArray(evidence)) {
    const results = evidence.map((e) => ingestEvidenceEntry(state, e));
    return { updated: true, ingested: results.filter((r) => r.ingested).length, total: evidence.length, results };
  }

  const result = ingestEvidenceEntry(state, evidence);
  return { updated: result.ingested, ...result };
}

function getUncertainty(agentId, topic) {
  if (!agentId) return null;
  const state = ensureState(agentId);
  const relevant = topic
    ? state.uncertainties.filter((u) => !u.resolved && u.topic === topic)
    : state.uncertainties.filter((u) => !u.resolved);
  if (relevant.length === 0) return { score: 0, topic: topic || 'all', unresolved: 0 };
  const avg = relevant.reduce((s, u) => s + u.score, 0) / relevant.length;
  return {
    score: Number(avg.toFixed(3)),
    topic: topic || 'all',
    unresolved: relevant.length,
    details: relevant.map((u) => ({ topic: u.topic, score: u.score, note: u.note }))
  };
}

function getConfidence(agentId, claimId) {
  if (!agentId) return null;
  const state = ensureState(agentId);
  const claim = state.claims.get(claimId);
  if (!claim) return { confidence: 0, found: false };
  return {
    confidence: confidenceFromEvidence(claim),
    evidenceQuality: evidenceQuality(claim),
    found: true,
    provenance: claim.provenance || null,
    type: claim.type
  };
}

function getKnownUnknowns(agentId) {
  if (!agentId) return [];
  const state = ensureState(agentId);
  return state.knownUnknowns.slice();
}

function getFullState(agentId) {
  if (!agentId) return null;
  return assembleEpistemicState(ensureState(agentId));
}

module.exports = {
  getState,
  updateState,
  getUncertainty,
  getConfidence,
  getKnownUnknowns,
  getFullState,
  // Exposed for testing and inter-service composition
  _ensureState: ensureState,
  _trackUncertainty: trackUncertainty,
  _trackKnownUnknown: trackKnownUnknown
};
