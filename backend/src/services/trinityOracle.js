'use strict';

const MAX_HISTORY = 200;

function candidateIds(input) {
  const candidates = Array.isArray(input.candidates) ? input.candidates : [];
  const ids = candidates.map((item) => String(item && item.id || '').trim()).filter(Boolean);
  if (!ids.length) throw oracleError('TRINITY_ORACLE_NO_CANDIDATES', 'Oracle prediction requires at least one candidate id.');
  return [...new Set(ids)];
}

function priorWeights(ids, history) {
  const weights = routingWeights({ history });
  const known = ids.filter((id) => weights[id] > 0);
  if (!known.length) return Object.fromEntries(ids.map((id) => [id, 1 / ids.length]));
  const total = known.reduce((sum, id) => sum + weights[id], 0);
  const distribution = {};
  for (const id of ids) distribution[id] = known.includes(id) ? weights[id] / total : 0;
  return distribution;
}

function predictPerformance(input = {}) {
  const ids = candidateIds(input);
  const distribution = priorWeights(ids, input.history);
  return { distribution, candidateIds: ids, method: 'calibrated_base_rates',
    advisoryOnly: true, decisionAuthority: 'none',
    note: 'Prediction only; never replaces evidence verification.' };
}

function alignedPairs(input = {}) {
  const prediction = input.prediction && typeof input.prediction === 'object' ? input.prediction : {};
  const outcomes = input.outcomes && typeof input.outcomes === 'object' ? input.outcomes : {};
  const ids = Object.keys(prediction).filter((id) => Number.isFinite(Number(outcomes[id])));
  if (!ids.length) throw oracleError('TRINITY_ORACLE_NO_ALIGNED_OUTCOMES', 'Scoring requires overlapping prediction and outcome ids.');
  return ids.map((id) => ({ id, predicted: clamp01(Number(prediction[id])), actual: clamp01(Number(outcomes[id])) }));
}

function brierScore(input = {}) {
  const pairs = alignedPairs(input);
  const mean = pairs.reduce((sum, pair) => sum + ((pair.predicted - pair.actual) ** 2), 0) / pairs.length;
  return Number(mean.toFixed(6));
}

function logLoss(input = {}) {
  const pairs = alignedPairs(input);
  const mean = pairs.reduce((sum, pair) => sum + lossTerm(pair), 0) / pairs.length;
  return Number(mean.toFixed(6));
}

function lossTerm(pair) {
  const clipped = Math.min(1 - 1e-6, Math.max(1e-6, pair.predicted));
  return -(pair.actual * Math.log(clipped) + (1 - pair.actual) * Math.log(1 - clipped));
}

function scorePrediction(input = {}) {
  return { brier: brierScore(input), logLoss: logLoss(input),
    advisoryOnly: true, decisionAuthority: 'none' };
}

function recordCalibration(input = {}) {
  const history = Array.isArray(input.history) ? [...input.history] : [];
  const entry = { prediction: input.prediction || {}, outcomes: input.outcomes || {},
    scores: scorePrediction(input), recordedAt: new Date().toISOString() };
  history.push(entry);
  return history.slice(-MAX_HISTORY);
}

function routingWeights(input = {}) {
  const history = Array.isArray(input.history) ? input.history : [];
  const skill = {};
  for (const entry of history) {
    for (const id of Object.keys(entry.outcomes || {})) {
      if (entry.scores && Number.isFinite(entry.scores.brier)) {
        skill[id] = skill[id] || { total: 0, count: 0 };
        skill[id].total += 1 - entry.scores.brier;
        skill[id].count += 1;
      }
    }
  }
  const weights = {};
  for (const [id, stat] of Object.entries(skill)) weights[id] = Number((stat.total / stat.count).toFixed(6));
  return weights;
}

function clamp01(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function oracleError(code, message) {
  return Object.assign(new Error(message), { code });
}

module.exports = { predictPerformance, brierScore, logLoss, scorePrediction, recordCalibration, routingWeights, MAX_HISTORY };
