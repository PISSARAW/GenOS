'use strict';

function estimateMarginalValue(item = {}) {
  const impact = unit(item.impact);
  const confidence = unit(item.confidence);
  const urgency = unit(item.urgency);
  return { score: impact * confidence * (0.5 + urgency / 2), impact, confidence, urgency };
}

function unit(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

module.exports = { estimateMarginalValue };
