'use strict';

function canonicalTriples(value) {
  return (Array.isArray(value) ? value : []).map((triple) => Array.isArray(triple)
    ? triple.map(Number).sort((left, right) => left - right).join(',') : '').sort();
}

function verifyIntegerPartitions(candidate) {
  const expected = ['1,2,9', '1,3,8', '1,4,7', '1,5,6', '2,3,7', '2,4,6', '3,4,5'];
  const actual = canonicalTriples(candidate?.triples);
  return { passed: actual.length === expected.length && actual.every((item, index) => item === expected[index]), expectedCount: expected.length };
}

function verifyDistinctLetters(candidate) {
  const expected = ['b', 'c', 'e', 'h', 'i', 'm', 'n', 'o', 'p', 's', 'è'];
  const actual = Array.isArray(candidate?.distinctLetters) ? [...new Set(candidate.distinctLetters.map(String))].sort() : [];
  return { passed: candidate?.count === expected.length && actual.length === expected.length
    && actual.every((letter, index) => letter === expected[index]), expected, expectedCount: expected.length };
}

function verifyDependencyOrder(candidate) {
  const order = Array.isArray(candidate?.order) ? candidate.order : [];
  const required = ['requirements', 'design', 'implementation', 'validation'];
  const positions = new Map(order.map((item, index) => [item, index]));
  const edges = [['requirements', 'design'], ['design', 'implementation'], ['implementation', 'validation']];
  const complete = order.length === required.length && required.every((item) => positions.has(item));
  const validEdges = edges.every(([before, after]) => positions.get(before) < positions.get(after));
  return { passed: complete && validEdges, required, validEdges };
}

function verifyArithmeticPartition(candidate) {
  const expected = { remaining: 21, perGroup: 3, remainder: 0 };
  return { passed: candidate?.remaining === expected.remaining && candidate?.perGroup === expected.perGroup
    && candidate?.remainder === expected.remainder, expected };
}

const VERIFIERS = Object.freeze({ verifyIntegerPartitions, verifyDistinctLetters,
  verifyDependencyOrder, verifyArithmeticPartition });

function verifyCandidate(task, candidate) {
  const verifier = VERIFIERS[task?.oracle];
  if (!verifier) throw new Error(`Unknown independent oracle: ${task?.oracle}`);
  return verifier(candidate);
}

module.exports = { verifyCandidate, verifyDependencyOrder, verifyDistinctLetters,
  verifyIntegerPartitions, verifyArithmeticPartition };
