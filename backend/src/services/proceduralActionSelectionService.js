"use strict";

function clamp01(value, fallback = 0) {
  const resolved = Number(value);
  if (!Number.isFinite(resolved)) return fallback;
  return Math.max(0, Math.min(1, resolved));
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
  const extraContext = clamp01(Number(context?.contextBonus) || 0);
  const rewardPrediction = clamp01(Number(context?.rewardPrediction) || 0);
  const surprise = clamp01(Number(context?.surprise) || 0);
  const explorationBonus = clamp01(Number(context?.explorationBonus) || 0);
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

function selectActions(candidates, context = {}, options = {}) {
  const list = Array.isArray(candidates) ? candidates.map(candidateAction) : [];
  if (!list.length) return { selected: [], context };
  const scored = list.map((a) => ({
    ...a,
    score: activationScore(a, context),
  }));
  scored.sort((x, y) => y.score - x.score);
  const topN = Number(options?.topN) || 1;
  const winnerTakeMost = Boolean(options?.winnerTakeMost);
  const selected = scored.slice(0, topN);
  let distribution;
  if (winnerTakeMost) {
    const topScore = selected.length ? selected[0].score : 0;
    const total = scored.reduce((acc, a) => acc + a.score, 0) || 1;
    distribution = scored.map((a) => ({
      id: a.id,
      score: a.score,
      probability: clamp01(a.score / total),
    }));
  } else {
    distribution = null;
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
};
