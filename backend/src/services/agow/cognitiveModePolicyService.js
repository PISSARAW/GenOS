'use strict';

const MODES = Object.freeze(['ACT', 'OBSERVE', 'VERIFY', 'RECALL', 'SIMULATE', 'REORGANIZE', 'CONSOLIDATE', 'ABSTAIN']);
const DEFAULT_COSTS = Object.freeze({ ACT: 0.18, OBSERVE: 0.16, VERIFY: 0.22, RECALL: 0.3,
  SIMULATE: 0.3, REORGANIZE: 0.38, CONSOLIDATE: 0.2, ABSTAIN: 0.25 });

function unit(value) { return Math.max(0, Math.min(1, Number(value) || 0)); }

function modeLoss(mode, signals, costs) {
  const uncertainty = unit(signals.uncertainty);
  const irreversibility = unit(signals.irreversibility);
  const selfUncertainty = unit(signals.selfTwinUncertainty ?? 1);
  const viabilityRisk = unit(signals.viabilityRisk);
  const goalUrgency = unit(signals.goalUrgency);
  const evidenceGap = unit(signals.evidenceGap);
  const base = Math.max(0, Number(costs[mode] ?? DEFAULT_COSTS[mode]));
  const risks = {
    ACT: uncertainty * 0.25 + irreversibility * selfUncertainty * 0.8 + viabilityRisk * 0.6 - goalUrgency * 0.25,
    OBSERVE: goalUrgency * 0.45 + uncertainty * 0.1,
    VERIFY: goalUrgency * 0.2 + evidenceGap * 0.1,
    RECALL: uncertainty * 0.2 + evidenceGap * 0.3,
    SIMULATE: goalUrgency * 0.15 + selfUncertainty * 0.2,
    REORGANIZE: irreversibility * 0.5 + evidenceGap * 0.25,
    CONSOLIDATE: goalUrgency * 0.4 + evidenceGap * 0.15,
    ABSTAIN: goalUrgency * 0.35 + viabilityRisk * 0.1
  };
  return Math.max(0, base + risks[mode]);
}

function evaluate(options = {}) {
  const signals = options.signals || {};
  const costs = options.modeCosts || {};
  const contextKey = contextSignature(signals);
  const experiences = (options.experiences || []).filter((item) => item.contextKey === contextKey);
  const estimates = MODES.map((mode) => ({ mode, expectedLoss: calibratedLoss(mode, options) }))
    .sort((left, right) => left.expectedLoss - right.expectedLoss);
  const chosen = estimates[0];
  return { mode: chosen.mode, expectedLoss: chosen.expectedLoss, alternatives: estimates,
    regretByMode: Object.fromEntries(estimates.map((item) => [item.mode, item.expectedLoss - chosen.expectedLoss])),
    contextKey, provenance: { method: 'cognitive_mode_regret_v1', calibrated: Boolean(experiences.length),
      signalsProvided: Object.keys(signals) } };
}

function contextSignature(signals) {
  return ['uncertainty', 'irreversibility', 'selfTwinUncertainty', 'viabilityRisk', 'goalUrgency', 'evidenceGap']
    .map((key) => `${key}:${Math.floor(unit(signals[key]) * 4)}`).join('|');
}

function calibratedLoss(mode, options) {
  const prior = modeLoss(mode, options.signals || {}, options.modeCosts || {});
  const experiences = (options.experiences || []).filter((entry) => entry.contextKey === contextSignature(options.signals || {}));
  const matching = experiences.filter((entry) => entry.mode === mode && Number.isFinite(entry.predictionError));
  if (!matching.length) return prior;
  const meanError = matching.reduce((sum, entry) => sum + entry.predictionError, 0) / matching.length;
  const weight = Math.min(0.75, matching.length / (matching.length + 4));
  return Math.max(0, prior + Math.max(-0.5, Math.min(0.5, meanError)) * weight);
}

function observeOutcome(options = {}) {
  const { decision, realizedLoss, mode } = options;
  if (!decision || !MODES.includes(mode || decision.mode) || !Number.isFinite(Number(realizedLoss))) {
    throw new Error('cognitive-mode-outcome-invalid');
  }
  const actualMode = mode || decision.mode;
  const estimated = decision.alternatives.find((item) => item.mode === actualMode)?.expectedLoss;
  if (!Number.isFinite(estimated)) throw new Error('cognitive-mode-estimate-missing');
  return { mode: actualMode, estimatedLoss: estimated, realizedLoss: Number(realizedLoss),
    predictionError: Number(realizedLoss) - estimated, decisionMode: decision.mode };
}

module.exports = { MODES, evaluate, observeOutcome, modeLoss, calibratedLoss, contextSignature };
