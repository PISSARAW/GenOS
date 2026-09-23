'use strict';

/**
 * Epistemic Pressure Service — converts epistemic state into decision signals.
 *
 * Computes six pressure dimensions (uncertainty, contradiction, evidence
 * deficit, independence deficit, unresolved hypotheses, calibration error)
 * and maps them to actionable decision hints.
 */

const { getState } = require('./epistemicStateService');
const {
  assessIndependence
} = require('../typedEvidenceAlgebraService');
const { calibrationGap } = require('../epistemic/core');

// ---------------------------------------------------------------------------
// Pressure dimension helpers (all ≤3 params, CC ≤10)
// ---------------------------------------------------------------------------

function pressureFromUncertainty(state) {
  const score = state.uncertaintyScore;
  return { value: score, severity: score > 0.7 ? 'high' : score > 0.4 ? 'medium' : 'low' };
}

function pressureFromContradiction(state) {
  const count = state.contradictionCount;
  return { value: Math.min(1, count * 0.2), severity: count > 2 ? 'high' : count > 0 ? 'medium' : 'low' };
}

function pressureFromEvidenceDeficit(state) {
  const claims = state.claims || [];
  const noEvidence = claims.filter((c) => !c.evidence || c.evidence.length === 0).length;
  const ratio = claims.length > 0 ? noEvidence / claims.length : 1;
  return { value: Number(ratio.toFixed(3)), severity: ratio > 0.5 ? 'high' : ratio > 0.2 ? 'medium' : 'low' };
}

function pressureFromIndependence(state) {
  const claims = state.claims || [];
  if (claims.length < 2) return { value: 0.5, severity: 'medium' };
  let dependentCount = 0;
  let pairCount = 0;
  for (let i = 0; i < claims.length; i++) {
    for (let j = i + 1; j < claims.length; j++) {
      pairCount++;
      const a = { type: claims[i].type, source: claims[i].provenance?.origin || claims[i].id, properties: {} };
      const b = { type: claims[j].type, source: claims[j].provenance?.origin || claims[j].id, properties: {} };
      const assessment = assessIndependence(a, b);
      if (assessment.dependencyStatus === 'proven_dependent') dependentCount++;
    }
  }
  const ratio = pairCount > 0 ? dependentCount / pairCount : 0;
  return { value: Number(ratio.toFixed(3)), severity: ratio > 0.5 ? 'high' : ratio > 0.2 ? 'medium' : 'low' };
}

function pressureFromUnresolved(state) {
  const unresolved = (state.uncertainties || []).filter((u) => !u.resolved).length;
  const knownUnknowns = (state.knownUnknowns || []).length;
  const total = unresolved + knownUnknowns;
  return { value: Math.min(1, total * 0.1), severity: total > 5 ? 'high' : total > 2 ? 'medium' : 'low' };
}

function pressureFromCalibration(state) {
  const gap = state.confidenceCalibration?.gap ?? 0;
  const absGap = Math.abs(gap);
  return { value: Number(absGap.toFixed(3)), severity: absGap > 0.3 ? 'high' : absGap > 0.1 ? 'medium' : 'low' };
}

// ---------------------------------------------------------------------------
// Pressure computation
// ---------------------------------------------------------------------------

function computePressure(epistemicState) {
  const state = epistemicState;
  if (!state) return null;

  const uncertainty = pressureFromUncertainty(state);
  const contradiction = pressureFromContradiction(state);
  const evidenceDeficit = pressureFromEvidenceDeficit(state);
  const independenceDeficit = pressureFromIndependence(state);
  const unresolvedHypotheses = pressureFromUnresolved(state);
  const calibrationError = pressureFromCalibration(state);

  const pressures = { uncertainty, contradiction, evidenceDeficit, independenceDeficit, unresolvedHypotheses, calibrationError };
  const maxSeverity = Math.max(
    uncertainty.value, contradiction.value, evidenceDeficit.value,
    independenceDeficit.value, unresolvedHypotheses.value, calibrationError.value
  );

  return {
    agentId: state.agentId,
    ...pressures,
    overallPressure: Number(maxSeverity.toFixed(3)),
    severity: maxSeverity > 0.6 ? 'critical' : maxSeverity > 0.4 ? 'high' : maxSeverity > 0.2 ? 'medium' : 'low',
    computedAt: new Date().toISOString()
  };
}

function computePressureForAgent(agentId) {
  if (!agentId) return null;
  const state = getState(agentId);
  if (!state) return null;
  return computePressure(state);
}

// ---------------------------------------------------------------------------
// Decision hints
// ---------------------------------------------------------------------------

const DECISION_HINTS = Object.freeze({
  EXPLORE: 'explore',
  FALSIFY: 'falsify',
  GATHER_EVIDENCE: 'gather_evidence',
  SEEK_INDEPENDENT_VERIFICATION: 'seek_independent_verification',
  RESOLVE_CONTRADICTIONS: 'resolve_contradictions',
  RECALIBRATE: 'recalibrate',
  COMMIT: 'commit',
  HOLD: 'hold'
});

function _dominantPressure(pressure) {
  const dims = ['uncertainty', 'contradiction', 'evidenceDeficit', 'independenceDeficit', 'unresolvedHypotheses', 'calibrationError'];
  let maxVal = -1;
  let maxDim = null;
  for (const d of dims) {
    const v = pressure[d]?.value ?? 0;
    if (v > maxVal) { maxVal = v; maxDim = d; }
  }
  return { dim: maxDim, value: maxVal };
}

function _hintForDimension(dim) {
  switch (dim) {
    case 'uncertainty': return DECISION_HINTS.EXPLORE;
    case 'contradiction': return DECISION_HINTS.RESOLVE_CONTRADICTIONS;
    case 'evidenceDeficit': return DECISION_HINTS.GATHER_EVIDENCE;
    case 'independenceDeficit': return DECISION_HINTS.SEEK_INDEPENDENT_VERIFICATION;
    case 'unresolvedHypotheses': return DECISION_HINTS.FALSIFY;
    case 'calibrationError': return DECISION_HINTS.RECALIBRATE;
    default: return DECISION_HINTS.HOLD;
  }
}

function pressureToDecision(pressure) {
  if (!pressure) return { decision: DECISION_HINTS.HOLD, reasons: ['No pressure data'] };

  const { dim, value } = _dominantPressure(pressure);
  if (value <= 0.1) {
    return {
      decision: DECISION_HINTS.COMMIT,
      reasons: ['All pressure dimensions within acceptable range'],
      dominantPressure: dim,
      confidence: Number((1 - value).toFixed(3))
    };
  }

  if (pressure.overallPressure > 0.7) {
    return {
      decision: DECISION_HINTS.HOLD,
      reasons: [`Critical pressure in ${dim}: ${value.toFixed(3)}`, 'Multiple dimensions may be elevated'],
      dominantPressure: dim,
      hints: [DECISION_HINTS.HOLD, _hintForDimension(dim)],
      confidence: Number((1 - value).toFixed(3))
    };
  }

  return {
    decision: _hintForDimension(dim),
    reasons: [`Elevated ${dim}: ${value.toFixed(3)}`],
    dominantPressure: dim,
    secondaryHints: _secondaryHints(pressure, dim),
    confidence: Number((1 - value).toFixed(3))
  };
}

function _secondaryHints(pressure, primaryDim) {
  const hints = [];
  const dims = ['uncertainty', 'contradiction', 'evidenceDeficit', 'independenceDeficit', 'unresolvedHypotheses', 'calibrationError'];
  for (const d of dims) {
    if (d === primaryDim) continue;
    if ((pressure[d]?.value ?? 0) > 0.3) {
      hints.push(_hintForDimension(d));
    }
  }
  return [...new Set(hints)];
}

module.exports = {
  computePressure,
  computePressureForAgent,
  pressureToDecision,
  DECISION_HINTS
};
