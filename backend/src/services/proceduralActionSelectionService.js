'use strict';

function clamp01(value, fallback = 0) {
  const resolved = Number(value);
  if (!Number.isFinite(resolved)) return fallback;
  return Math.max(0, Math.min(1, resolved));
}

function num(value, fallback = 0) {
  if (value == null) return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function candidateAction(input = {}) {
  const a = Object.assign({}, input);
  a.id = a.id || `action-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  a.weight = clamp01(a.weight == null ? 0.5 : Number(a.weight));
  a.contextMatch = clamp01(a.contextMatch == null ? 0.5 : Number(a.contextMatch));
  a.expectedUtility = clamp01(a.expectedUtility == null ? 0.5 : Number(a.expectedUtility));
  a.evidence = clamp01(a.evidence == null ? 0.5 : Number(a.evidence));
  a.risk = clamp01(a.risk == null ? 0.2 : Number(a.risk));
  a.inhibition = clamp01(a.inhibition == null ? 0 : Number(a.inhibition));
  a.alias = a.alias || null;
  a.metadata = a.metadata || {};
  return a;
}

function activationScore(action, context = {}) {
  const a = candidateAction(action);
  const extraContext = clamp01(num(context?.contextBonus));
  const rewardPrediction = clamp01(num(context?.rewardPrediction));
  const surprise = clamp01(num(context?.surprise));
  const explorationBonus = clamp01(num(context?.explorationBonus));
  const score =
    a.weight * 0.25 +
    a.contextMatch * 0.20 +
    a.expectedUtility * 0.20 +
    a.evidence * 0.15 -
    a.risk * 0.12 -
    a.inhibition * 0.15 +
    extraContext * 0.05 +
    rewardPrediction * 0.05 +
    surprise * 0.05 +
    explorationBonus * 0.05;
  return clamp01(score);
}

function softmax(scores, temperature = 1.0) {
  if (!Array.isArray(scores) || !scores.length) return [];
  const t = Math.max(0.01, Number(temperature) || 1);
  const maxScore = Math.max(...scores);
  const exps = scores.map((s) => Math.exp((s - maxScore) / t));
  const sum = exps.reduce((a, b) => a + b, 0) || 1;
  return exps.map((e) => e / sum);
}

function selectActions(candidates, context = {}, options = {}) {
  const list = Array.isArray(candidates) ? candidates.map(candidateAction) : [];
  if (!list.length) return { selected: [], context };
  const scored = list.map((a) => ({
    ...a,
    score: activationScore(a, context),
  }));
  scored.sort((x, y) => y.score - x.score);
  const topN = Number(options?.topN) || 1;
  const temperature = options.temperature != null ? Number(options.temperature) : 1.0;
  const winnerTakeMost = Boolean(options?.winnerTakeMost);
  const selected = scored.slice(0, topN);
  let distribution = null;
  if (winnerTakeMost) {
    const scores = scored.map((a) => a.score);
    const probs = softmax(scores, temperature);
    distribution = scored.map((a, i) => ({
      id: a.id,
      score: a.score,
      probability: probs[i],
    }));
  }
  return {
    selected,
    context,
    distribution,
    winner: selected.length ? selected[0] : null,
  };
}

function competitiveInhibition(candidates, selectedIds, context = {}) {
  const set = new Set(Array.isArray(selectedIds) ? selectedIds.map(String) : []);
  return candidates.map((c) => {
    const a = candidateAction(c);
    if (set.has(String(a.id))) return a;
    return Object.assign({}, a, { inhibition: clamp01(a.inhibition + 0.15) });
  });
}

module.exports = {
  candidateAction,
  activationScore,
  selectActions,
  competitiveInhibition,
  softmax,
};
