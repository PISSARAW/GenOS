/**
 * Shared helpers for the evolution primitive modules (split of evolution.js
 * for the quality gate: each file stays <= 400 lines / complexity <= 10).
 */

const MUTABLE_GENES = new Set(['role', 'strategy', 'tools', 'temp', 'topP']);

function boundedPercentage(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  if (number < 0) return 0;
  if (number > 100) return 100;
  return number;
}

module.exports = {
  MUTABLE_GENES,
  boundedPercentage
};
