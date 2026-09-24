'use strict';

function learnTransitionPrior(observations = [], prior = {}) {
  const totals = new Map();
  for (const item of observations) {
    if (!item || !item.from || !item.to || !Number.isFinite(item.reward)) continue;
    const key = `${item.from}->${item.to}`;
    const entry = totals.get(key) || { sum: 0, count: 0 };
    entry.sum += Math.max(-1, Math.min(1, item.reward));
    entry.count += 1;
    totals.set(key, entry);
  }
  return Object.fromEntries([...totals].map(([key, value]) => [key, { prior: prior[key] || 0, observedMean: value.sum / value.count, count: value.count }]));
}

module.exports = { learnTransitionPrior };
