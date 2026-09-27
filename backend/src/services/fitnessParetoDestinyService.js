'use strict';

function validCandidate(candidate) {
  return candidate && candidate.id && Number.isFinite(Number(candidate.fitness)) && Array.isArray(candidate.metrics);
}

function dominates(left, right) {
  const metrics = left.metrics.map(Number); const other = right.metrics.map(Number);
  return left.fitness >= right.fitness && metrics.every((value, index) => value >= (other[index] || 0)) && (left.fitness > right.fitness || metrics.some((value, index) => value > (other[index] || 0)));
}

function evaluate(candidates) {
  const list = Array.isArray(candidates) ? candidates : [];
  const valid = list.filter(validCandidate); const unknown = list.filter((candidate) => !validCandidate(candidate));
  const front = valid.filter((candidate) => !valid.some((other) => other !== candidate && dominates(other, candidate)));
  return { paretoFront: front, dominated: valid.filter((candidate) => !front.includes(candidate)), unknown, promotionAllowed: unknown.length === 0 && front.length > 0, destinies: front.map((candidate) => ({ id: candidate.id, destiny: candidate.niche || 'candidate' })) };
}

module.exports = { evaluate, dominates };
