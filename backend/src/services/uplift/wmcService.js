'use strict';

function sortedBySolo(candidates) {
  return [...(candidates || [])]
    .filter((c) => c && Number.isFinite(c.genosScore))
    .sort((a, b) => Number(a.soloScore || 0) - Number(b.soloScore || 0));
}

function beatsTarget(candidate, target) {
  const bar = Number(target.score) + (Number(target.margin) || 0);
  const level = candidate.lcb !== null && candidate.lcb !== undefined
    ? Number(candidate.lcb)
    : Number(candidate.genosScore);
  return Number.isFinite(level) && level > bar;
}

function weakestCrossover(candidates, target) {
  const ordered = sortedBySolo(candidates);
  for (const c of ordered) {
    if (beatsTarget(c, target || {})) return c;
  }
  return null;
}

function wmcCurve(history, target) {
  const out = [];
  for (const h of history || []) {
    const found = weakestCrossover(h.candidates, target);
    out.push({ genosVersion: h.genosVersion, weakest: found ? found.model : null });
  }
  return out;
}

module.exports = {
  weakestCrossover,
  wmcCurve
};
