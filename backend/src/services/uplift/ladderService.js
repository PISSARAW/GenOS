'use strict';

function soloEntries(runs) {
  const byModel = new Map();
  for (const r of runs || []) {
    if (!isSoloRun(r)) continue;
    const model = String(r.model || '').trim();
    const score = Number(r.score);
    if (!isValidEntry(model, score)) continue;
    if (!byModel.has(model)) byModel.set(model, []);
    byModel.get(model).push(score);
  }
  return [...byModel.entries()].map(([model, scores]) => ({
    model,
    score: scores.reduce((s, v) => s + v, 0) / scores.length,
    n: scores.length
  }));
}

function isSoloRun(run) {
  return Boolean(run) && run.mode === 'solo' && run.score !== null &&
    run.score !== undefined && run.score !== '';
}

function isValidEntry(model, score) {
  return Boolean(model) && Number.isFinite(score);
}

function buildLadder(runs) {
  const solos = soloEntries(runs || []);
  return solos.sort((a, b) => a.score - b.score || a.model.localeCompare(b.model))
    .map((entry, index) => ({ ...entry, rank: index }));
}

function effectiveRank(genosScore, ladder) {
  const score = Number(genosScore);
  if (!Number.isFinite(score)) return null;
  let rank = 0;
  for (const step of ladder || []) {
    if (step.score <= score) rank = step.rank + 1;
  }
  return rank;
}

function highestBeaten(entry, ladder) {
  const score = Number(entry && entry.genosScore);
  const steps = ladder || [];
  let best = null;
  for (const step of steps) {
    if (Number.isFinite(score) && step.score < score) best = step;
  }
  return best;
}

function tierUplift(baseRank, effective) {
  if (!Number.isInteger(baseRank) || !Number.isInteger(effective)) return null;
  return effective - baseRank - 1;
}

function baseRankOf(model, ladder) {
  const found = (ladder || []).find((s) => s.model === model);
  return found ? found.rank : null;
}

function upliftCard(entry, ladder) {
  const base = baseRankOf(entry.baseModel, ladder);
  const rank = effectiveRank(entry.genosScore, ladder);
  const beaten = highestBeaten(entry, ladder);
  const uplift = base !== null && rank !== null ? tierUplift(base, rank) : null;
  return {
    baseModel: entry.baseModel,
    soloScore: entry.soloScore ?? null,
    genosScore: entry.genosScore ?? null,
    baseRank: base,
    effectiveRank: rank,
    tierUplift: uplift,
    highestBeaten: beaten ? beaten.model : null,
    kind: 'metric',
    qualityGuarantee: false
  };
}

module.exports = {
  buildLadder,
  effectiveRank,
  highestBeaten,
  tierUplift,
  upliftCard
};
