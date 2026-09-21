'use strict';

/**
 * Sélection écologique épistémique.
 *
 * Consensus pondéré par diversité fonctionnelle et calibration, pas par
 * simple majorité. Un groupe avec une diversité effective élevée et des
 * erreurs non corrélées produit un consensus plus fiable.
 */

const { effectiveDiversity } = require('./epistemicBiocenoseService');

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
    confidence: Math.min(1, diversity * Math.log2(Math.max(2, votes.length)) / Math.log2(Math.max(2, votes.length))),
  };
}

function consensusQuality(votes = [], diversity = 0.5) {
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
    isReliable: diversity > 0.3 && variance < 0.25,
  };
}

function ecologicalSelection(populations = [], opts = {}) {
  if (!populations.length) return null;
  const diversityThreshold = opts.diversityThreshold || 0.3;
  const selected = populations.filter((p) => {
    const div = p.effectiveDiversity || effectiveDiversity(p.reviewers || []);
    return div >= diversityThreshold;
  });
  return {
    selected: selected.length,
    total: populations.length,
    selectedIds: selected.map((p) => p.id || p.niche),
    diversityThreshold,
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
