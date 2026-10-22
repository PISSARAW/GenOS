'use strict';

function schedule(detection, input = {}) {
  const risk = Math.max(0, Number(input.risk) || detection.confidence);
  const budget = Math.max(0, Number(input.budget) || 0);
  if (detection.classification === 'indeterminate') return { action: 'observe', reason: 'evidence-insufficient', cost: 0 };
  if (risk >= 0.85 && budget >= 2) return { action: 'escalate', reason: 'high-risk', cost: 2 };
  if (risk >= 0.5 && budget >= 1) return { action: 'investigate', reason: 'risk-budget-qualified', cost: 1 };
  if (risk >= 0.35) return { action: 'observe', reason: 'budget-limited', cost: 0 };
  return { action: 'no-change', reason: 'below-action-threshold', cost: 0 };
}

module.exports = { schedule };
