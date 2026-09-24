'use strict';

function semanticDistance(left, right) {
  const first = new Set(tokens(left));
  const second = new Set(tokens(right));
  const union = new Set([...first, ...second]);
  if (!union.size) return 0;
  const intersection = [...first].filter((token) => second.has(token)).length;
  return Number((1 - intersection / union.size).toFixed(4));
}

function tokens(value) {
  return String(value || '').toLowerCase().split(/[^a-z0-9]+/).filter((token) => token.length > 2);
}

module.exports = { semanticDistance };
