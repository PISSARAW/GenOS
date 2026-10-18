'use strict';

/**
 * Sélection écologique épistémique.
 *
 * Consensus pondéré et diagnostics descriptifs. Sans campagne de calibration,
 * ni la variété observée ni l'accord des votes ne qualifient la fiabilité.
 */

const { effectiveDiversity, isMonoculture } = require('./epistemicBiocenoseService');

function brierScore(probability, outcome) {
  const o = outcome ? 1 : 0;
  return Math.pow(probability - o, 2);
}

function weightedConsensus(votes = [], diversity = 0.5) {
  if (!votes.length) return null;
  const totalWeight = votes.reduce((sum, v) => sum + (v.weight || 1), 0);
  const weightedSum = votes.reduce((sum, v) => sum + (v.probability || 0) * (v.weight || 1), 0);
  const consensus = totalWeight > 0 ? weightedSum / totalWeight : 0.5;
  return {
    consensus,
    totalWeight,
    voteCount: votes.length,
    diversity,
    confidence: Math.min(1, diversity),
    confidenceStatus: 'uncalibrated_proxy',
  };
}

function consensusQuality(votes = [], diversity = 0.5, calibration = {}) {
  if (!votes.length) return null;
  const probs = votes.map((v) => v.probability || 0);
  const mean = probs.reduce((a, b) => a + b, 0) / probs.length;
  const variance = probs.reduce((sum, p) => sum + Math.pow(p - mean, 2), 0) / probs.length;
  const weighted = weightedConsensus(votes, diversity);
  return {
    meanProbability: mean,
    variance,
    effectiveDiversity: diversity,
    consensus: weighted.consensus,
    confidence: weighted.confidence,
    confidenceStatus: weighted.confidenceStatus,
    isReliable: calibration.status === 'calibrated'
      && diversity >= calibration.minimumDiversity
      && variance <= calibration.maximumVariance,
  };
}

function ecologicalSelection(populations = [], opts = {}) {
  if (!populations.length) return null;
  const diversityThreshold = Number.isFinite(opts.diversityThreshold)
    ? opts.diversityThreshold : null;
  const selected = populations.filter((p) => {
    if (diversityThreshold === null) return !isMonoculture(p.reviewers || [], opts.diversityPolicy);
    const div = p.effectiveDiversity ?? effectiveDiversity(p.reviewers || []);
    return div >= diversityThreshold;
  });
  return {
    selected: selected.length,
    total: populations.length,
    selectedIds: selected.map((p) => p.id || p.niche),
    diversityThreshold,
    selectionBasis: diversityThreshold === null ? 'structural_minima' : 'explicit_threshold',
  };
}

function consensusObserver(populations = [], outcomes = []) {
  const results = populations.map((pop) => {
    const votes = (pop.reviewers || []).map((r, idx) => ({
      probability: r.probability || 0.5,
      weight: r.calibration || 1,
      outcome: outcomes[idx],
    }));
    const quality = consensusQuality(votes, pop.effectiveDiversity || 0.5);
    return {
      population: pop.id || pop.niche,
      ...quality,
    };
  });
  return {
    observerCount: populations.length,
    results,
    reliableCount: results.filter((r) => r.isReliable).length,
  };
}

module.exports = {
  brierScore,
  weightedConsensus,
  consensusQuality,
  ecologicalSelection,
  consensusObserver,
};
