'use strict';

/**
 * Epistemic Revision Service — belief revision with provenance.
 *
 * Orchestrates evidence scoring, Bayesian updates, contradiction detection,
 * and confidence recalibration to revise agent beliefs based on new evidence.
 */

const { getState, updateState, _ensureState } = require('./epistemicStateService');
const {
  validateClaim,
  evidenceQuality,
  confidenceFromEvidence
} = require('../epistemic/claimTypes');
const {
  createEpistemicDebt,
  getEpistemicDebts,
  resolveEpistemicDebt,
  DEBT_REASONS,
  calibrationGap,
  confidenceWithStakes,
  DECAY_CURVES
} = require('../epistemic/core');
const {
  resolveProvenance
} = require('../provenanceResolver');
const {
  bayesUpdate
} = require('../probabilityService');
const { evidenceScore, typedEvidenceSummary } = require('../agentEvidenceService');
const { inspectEvent } = require('../hallucinationMonitoringService');

// ---------------------------------------------------------------------------
// Belief revision
// ---------------------------------------------------------------------------

function reviseBelief(claimId, evidence) {
  if (!claimId) return { revised: false, reason: 'claimId required' };
  if (!evidence) return { revised: false, reason: 'evidence required' };

  const priorQuality = evidence.evidenceQuality ?? 0.5;
  const newQuality = evidence.quality ?? evidence.evidenceQuality ?? 0.5;

  const bayesResult = bayesUpdate({
    prior: priorQuality,
    likelihood: newQuality,
    likelihoodNotH: 1 - newQuality
  });

  const revisedConfidence = bayesResult.posterior ?? priorQuality;

  const provenance = evidence.provenance || {
    origin: evidence.source || 'revision',
    method: 'bayesian_update',
    priorQuality,
    newQuality
  };

  const debt = [];
  if (revisedConfidence < 0.5) {
    debt.push({
      reason: DEBT_REASONS.UNVERIFIED_BELIEF,
      description: `Belief revised below 0.5 confidence: ${revisedConfidence.toFixed(3)}`
    });
  }

  return {
    revised: true,
    claimId,
    priorConfidence: Number(priorQuality.toFixed(3)),
    revisedConfidence: Number(revisedConfidence.toFixed(3)),
    change: Number((revisedConfidence - priorQuality).toFixed(3)),
    provenance,
    bayesResult,
    debt,
    revisedAt: new Date().toISOString()
  };
}

// ---------------------------------------------------------------------------
// Contradiction handling
// ---------------------------------------------------------------------------

function detectContradiction(claimA, claimB) {
  if (!claimA || !claimB) return { contradiction: false, reason: 'Both claims required' };

  const stmtA = (claimA.statement || '').toLowerCase().trim();
  const stmtB = (claimB.statement || '').toLowerCase().trim();
  if (!stmtA || !stmtB) return { contradiction: false, reason: 'Empty statements' };

  const qualityA = evidenceQuality(claimA);
  const qualityB = evidenceQuality(claimB);
  const avgQuality = (qualityA + qualityB) / 2;

  const negationPatterns = [
    { a: /\bnot\b/, b: /\b(is|are|will|can)\b/ },
    { a: /\bfalse\b/, b: /\btrue\b/ },
    { a: /\bno\b/, b: /\byes\b/ },
    { a: /\bnever\b/, b: /\balways\b/ }
  ];

  let contradictionDetected = false;
  let pattern = null;
  for (const p of negationPatterns) {
    const aMatch = stmtA.match(p.a) && !stmtA.match(p.b);
    const bMatch = stmtB.match(p.a) && !stmtB.match(p.b);
    const aMatchInv = stmtA.match(p.b) && !stmtA.match(p.a);
    const bMatchInv = stmtB.match(p.b) && !stmtB.match(p.a);
    if ((aMatch && bMatchInv) || (bMatch && aMatchInv)) {
      contradictionDetected = true;
      pattern = p;
      break;
    }
  }

  const directNegation = (stmtA.startsWith('not ') && stmtA.slice(4) === stmtB) ||
    (stmtB.startsWith('not ') && stmtB.slice(4) === stmtA);
  if (directNegation) {
    contradictionDetected = true;
    pattern = { a: /^not /, b: /.*/ };
  }

  if (!contradictionDetected) {
    return { contradiction: false, similarity: 0 };
  }

  return {
    contradiction: true,
    claimA: claimA.id,
    claimB: claimB.id,
    qualityA: Number(qualityA.toFixed(3)),
    qualityB: Number(qualityB.toFixed(3)),
    avgQuality: Number(avgQuality.toFixed(3)),
    pattern: pattern ? pattern.a.source : 'direct_negation',
    resolution: avgQuality < 0.4 ? 'escalate' : 'merge'
  };
}

function handleContradiction(claimA, claimB) {
  if (!claimA || !claimB) return { handled: false, reason: 'Both claims required' };

  const detection = detectContradiction(claimA, claimB);
  if (!detection.contradiction) {
    return { handled: true, contradiction: false, action: 'none' };
  }

  if (detection.resolution === 'escalate') {
    return {
      handled: true,
      contradiction: true,
      action: 'escalate',
      reason: 'Low-quality contradictory claims require human review',
      detection,
      escalatedAt: new Date().toISOString()
    };
  }

  const qualityA = detection.qualityA;
  const qualityB = detection.qualityB;
  const winner = qualityA >= qualityB ? claimA : claimB;
  const loser = qualityA >= qualityB ? claimB : claimA;

  return {
    handled: true,
    contradiction: true,
    action: 'merge',
    resolution: 'higher_quality_wins',
    winner: winner.id,
    loser: loser.id,
    reason: `Retained claim ${winner.id} (quality ${Math.max(qualityA, qualityB).toFixed(3)}) over ${loser.id} (quality ${Math.min(qualityA, qualityB).toFixed(3)})`,
    detection,
    resolvedAt: new Date().toISOString()
  };
}

// ---------------------------------------------------------------------------
// Confidence recalibration
// ---------------------------------------------------------------------------

function computeCalibrationOutcomes(state) {
  const claims = Array.from(state.claims.values());
  if (claims.length === 0) return { predicted: 0, actual: 0, gap: 0 };

  const predictions = claims.map((c) => confidenceWithStakes(c));
  const avgPredicted = predictions.reduce((s, p) => s + p, 0) / predictions.length;

  const actuals = claims.map((c) => {
    const monitor = inspectEvent({
      eventType: 'EVIDENCE_INGESTED',
      payload: { claims: [c] },
      agentId: state.agentId
    });
    return monitor.detected ? 0 : 1;
  });
  const avgActual = actuals.reduce((s, a) => s + a, 0) / actuals.length;

  const gap = avgPredicted - avgActual;
  return {
    predicted: Number(avgPredicted.toFixed(3)),
    actual: Number(avgActual.toFixed(3)),
    gap: Number(gap.toFixed(3))
  };
}

function updateConfidence(agentId) {
  if (!agentId) return { updated: false, reason: 'agentId required' };
  const state = _ensureState(agentId);
  const calibration = computeCalibrationOutcomes(state);
  state.confidenceCalibration = calibration;
  state.lastUpdated = new Date().toISOString();
  return {
    updated: true,
    agentId,
    calibration,
    severity: Math.abs(calibration.gap) > 0.3 ? 'high' : Math.abs(calibration.gap) > 0.1 ? 'medium' : 'low'
  };
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  reviseBelief,
  detectContradiction,
  handleContradiction,
  updateConfidence,
  computeCalibrationOutcomes
};
