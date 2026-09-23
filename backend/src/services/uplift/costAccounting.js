'use strict';

function ratio(quality, cost) {
  const q = Number(quality);
  const c = Number(cost);
  if (!Number.isFinite(q) || !Number.isFinite(c) || c <= 0) return null;
  return q / c;
}

function efficiency(score, cost) {
  return ratio(score, cost);
}

function tokenEfficiency(score, tokens) {
  return ratio(score, tokens);
}

function multiplier(genos, solo) {
  const g = Number(genos);
  const s = Number(solo);
  if (!Number.isFinite(g) || !Number.isFinite(s) || s <= 0) return null;
  return g / s;
}

function summarizeCost(pair) {
  const p = pair || {};
  return {
    qualityDelta: deltaOf(p.genosQuality, p.soloQuality),
    costMultiplier: multiplier(p.genosCost, p.soloCost),
    tokenMultiplier: multiplier(p.genosTokens, p.soloTokens),
    qualityPerCostGain: gainOf(p),
    kind: 'metric',
    qualityGuarantee: false
  };
}

function deltaOf(genos, solo) {
  const g = Number(genos);
  const s = Number(solo);
  if (!Number.isFinite(g) || !Number.isFinite(s)) return null;
  return g - s;
}

function gainOf(pair) {
  const p = pair || {};
  const g = ratio(p.genosQuality, p.genosCost);
  const s = ratio(p.soloQuality, p.soloCost);
  if (g === null || s === null || s === 0) return null;
  return g / s - 1;
}

module.exports = {
  efficiency,
  tokenEfficiency,
  multiplier,
  summarizeCost
};
