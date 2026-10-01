'use strict';

const LEVELS = Object.freeze([
  { id: 'T0', object: 'perception', learningRate: 0.8, minEvidence: 1 },
  { id: 'T1', object: 'attention_routing', learningRate: 0.65, minEvidence: 2 },
  { id: 'T2', object: 'strategy', learningRate: 0.45, minEvidence: 3 },
  { id: 'T3', object: 'world_self_episode', learningRate: 0.3, minEvidence: 4 },
  { id: 'T4', object: 'procedure_competence', learningRate: 0.18, minEvidence: 6 },
  { id: 'T5', object: 'morphology', learningRate: 0.08, minEvidence: 10 },
  { id: 'T6', object: 'lineage', learningRate: 0.03, minEvidence: 20 }
]);

function levelOf(id) {
  const level = LEVELS.find((item) => item.id === id);
  if (!level) throw new Error(`unknown-timescale:${id}`);
  return level;
}

function posterior(options) {
  const { prior, prediction, observation, precision, learningRate } = options;
  const p = Number.isFinite(prior) ? prior : 0;
  const predicted = Number.isFinite(prediction) ? prediction : p;
  const observed = Number(observation);
  if (!Number.isFinite(observed)) throw new Error('numeric-observation-required');
  const rate = Math.max(0, Math.min(1, learningRate * Math.max(0, Math.min(1, precision))));
  return { prior: p, prediction: predicted, posterior: p + rate * (observed - p),
    predictionError: observed - predicted, precision: Math.max(0, Math.min(1, precision)), learningRate: rate };
}

function evidenceGate(options) {
  const { levelId, evidenceCount, independentCount } = options;
  const level = levelOf(levelId);
  return evidenceCount >= level.minEvidence && independentCount >= Math.min(level.minEvidence, 3);
}

module.exports = { LEVELS, levelOf, posterior, evidenceGate };
