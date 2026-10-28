'use strict';

function contextBudget(options, maximum) {
  const requested = Number(options?.memoryContextTokenBudget);
  if (!Number.isFinite(requested) || requested < 0) return maximum;
  return Math.min(maximum, Math.floor(requested));
}

function selectRegularVesicles(lines, limit, measure) {
  const selected = [];
  for (const line of lines || []) {
    selected.push(line);
    if (measure(selected) > limit) selected.pop();
  }
  return selected;
}

module.exports = { contextBudget, selectRegularVesicles };
