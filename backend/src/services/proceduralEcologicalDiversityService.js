"use strict";

function clamp01(value, fallback = 0) {
  const resolved = Number(value);
  if (!Number.isFinite(resolved)) return fallback;
  return Math.max(0, Math.min(1, resolved));
}

function assignNiche(procedures, niches) {
  const result = {};
  for (const proc of procedures) {
    const scores = niches.map((niche) => ({ niche, score: clamp01(niche.scoreFor(proc)) }));
    scores.sort((a, b) => b.score - a.score);
    result[proc.id] = { niche: scores[0]?.niche || null, score: scores[0]?.score || 0 };
  }
  return result;
}

function hasNicheOverlap(procA, procB) {
  if (!procA?.niche || !procB?.niche) return false;
  return procA.niche.id === procB.niche.id;
}

function diversityIndex(populations) {
  const total = populations.reduce((acc, p) => acc + p.size, 0);
  if (!total) return 0;
  const proportions = populations.map((p) => p.size / total);
  return 1 - proportions.reduce((acc, p) => acc + p * p, 0);
}

module.exports = {
  assignNiche,
  hasNicheOverlap,
  diversityIndex,
};
