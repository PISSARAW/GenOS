'use strict';

function toFinite(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function mean(values) {
  const nums = values.map(toFinite).filter((v) => v !== null);
  if (!nums.length) return null;
  return nums.reduce((s, v) => s + v, 0) / nums.length;
}

function pairedDifferences(pairs) {
  if (!Array.isArray(pairs)) return [];
  return pairs
    .map((p) => {
      const a = toFinite(p && p.genos);
      const b = toFinite(p && p.solo);
      if (a === null || b === null) return null;
      return a - b;
    })
    .filter((v) => v !== null);
}

function mulberry32(seed) {
  let s = Number(seed) >>> 0 || 1;
  return () => {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function resampleMean(diffs, rand) {
  let sum = 0;
  for (let i = 0; i < diffs.length; i += 1) {
    sum += diffs[Math.floor(rand() * diffs.length)];
  }
  return sum / diffs.length;
}

function bootstrapMeans(diffs, opts) {
  const reps = Math.max(100, Number(opts.reps) || 2000);
  const rand = mulberry32(opts.seed ?? 42);
  const out = [];
  for (let r = 0; r < reps; r += 1) out.push(resampleMean(diffs, rand));
  out.sort((a, b) => a - b);
  return out;
}

function quantile(sorted, q) {
  if (!sorted.length) return null;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

function confidenceInterval(diffs, opts) {
  if (diffs.length < 2) return { lcb: null, ucb: null };
  const alpha = Number(opts.alpha) || 0.05;
  const sorted = bootstrapMeans(diffs, opts);
  return {
    lcb: quantile(sorted, alpha / 2),
    ucb: quantile(sorted, 1 - alpha / 2)
  };
}

function summarizePaired(pairs, opts) {
  const cfg = opts || {};
  const diffs = pairedDifferences(pairs);
  const delta = mean(diffs);
  if (delta === null) return { n: 0, delta: null, inconclusive: true };
  const ci = confidenceInterval(diffs, cfg);
  const margin = Number(cfg.delta) || 0;
  const beaten = ci.lcb !== null && ci.lcb > margin;
  return {
    n: diffs.length,
    delta,
    lcb: ci.lcb,
    ucb: ci.ucb,
    margin,
    beaten,
    inconclusive: !beaten,
    kind: 'metric',
    qualityGuarantee: false
  };
}

module.exports = {
  mean,
  pairedDifferences,
  summarizePaired,
  confidenceInterval
};
