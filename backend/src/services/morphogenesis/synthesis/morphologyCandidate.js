'use strict';

const crypto = require('node:crypto');

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort()
    .map((key) => [key, stableValue(value[key])]));
}

function digest(value) {
  return crypto.createHash('sha256')
    .update(JSON.stringify(stableValue(value))).digest('hex');
}

function expressionChildren(expression) {
  if (!expression || typeof expression !== 'object') return [];
  if (expression.kind === 'NEST') return [expression.host, expression.inner];
  if (expression.kind === 'GATE') {
    return [expression.condition, expression.thenBranch, expression.elseBranch];
  }
  if (expression.kind === 'WRAP') return [expression.inner];
  if (expression.kind === 'BRIDGE') return [expression.source, expression.target];
  if (expression.kind === 'FEDERATE') return expression.members || [];
  return Array.isArray(expression.children) ? expression.children : [];
}

function inspectExpression(expression, depth, state) {
  if (!expression || typeof expression !== 'object') return;
  state.nodeCount += 1;
  state.maxDepth = Math.max(state.maxDepth, depth);
  state.kinds[expression.kind] = (state.kinds[expression.kind] || 0) + 1;
  if (expression.topology) {
    state.topologies.push(`${expression.topology}:${expression.variant || 'default'}`);
  }
  for (const child of expressionChildren(expression)) {
    inspectExpression(child, depth + 1, state);
  }
}

function describeExpression(expression) {
  const state = { nodeCount: 0, maxDepth: 0, kinds: {}, topologies: [] };
  inspectExpression(expression, 1, state);
  state.topologies.sort();
  return state;
}

function assertExpression(expression) {
  if (!expression || typeof expression !== 'object') {
    throw new TypeError('MorphologyCandidate requires an expression.');
  }
}

function copyArray(value) {
  return Array.isArray(value) ? structuredClone(value) : [];
}

function copyObject(value) {
  return value && typeof value === 'object' ? { ...value } : {};
}

function candidateGeneration(value) {
  return Math.max(0, Number(value) || 0);
}

function nullable(value) {
  return value === undefined ? null : value;
}

function candidateIdentity(input, context) {
  if (input.candidateId) return input.candidateId;
  return `morph-${digest(context).slice(0, 24)}`;
}

function createCandidate(input = {}) {
  assertExpression(input.expression);
  const mutations = copyArray(input.mutations);
  const parentIds = copyArray(input.parentIds);
  const generation = candidateGeneration(input.generation);
  const identity = { expression: input.expression, mutations, parentIds, generation };
  return {
    candidateId: candidateIdentity(input, identity),
    expression: structuredClone(input.expression),
    parentIds,
    generation,
    operator: input.operator || 'SEED',
    mutations,
    descriptor: input.descriptor || describeExpression(input.expression),
    registryVersions: copyObject(input.registryVersions),
    constraints: copyObject(input.constraints),
    estimatedUtility: nullable(input.estimatedUtility),
    observedUtility: nullable(input.observedUtility),
    evidenceRefs: copyArray(input.evidenceRefs),
    searchBudget: copyObject(input.searchBudget),
    probability: nullable(input.probability),
    status: input.status || 'generated'
  };
}

function numericSimilarity(left, right) {
  const largest = Math.max(1, left, right);
  return 1 - Math.abs(left - right) / largest;
}

function mapSimilarity(left, right) {
  const keys = new Set([...Object.keys(left || {}), ...Object.keys(right || {})]);
  if (!keys.size) return 1;
  let total = 0;
  for (const key of keys) total += numericSimilarity(left[key] || 0, right[key] || 0);
  return total / keys.size;
}

function setSimilarity(left, right) {
  const a = new Set(left || []);
  const b = new Set(right || []);
  const union = new Set([...a, ...b]);
  if (!union.size) return 1;
  return [...a].filter((value) => b.has(value)).length / union.size;
}

function structuralSimilarity(left, right) {
  const a = left.descriptor || describeExpression(left.expression || left.morphology);
  const b = right.descriptor || describeExpression(right.expression || right.morphology);
  return (numericSimilarity(a.nodeCount, b.nodeCount)
    + numericSimilarity(a.maxDepth, b.maxDepth)
    + mapSimilarity(a.kinds, b.kinds)
    + 3 * setSimilarity(a.topologies, b.topologies)) / 6;
}

function createSeededRandom(seed) {
  let state = Number.parseInt(digest(String(seed)).slice(0, 8), 16) || 1;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 0x100000000;
  };
}

module.exports = { createCandidate, createSeededRandom, describeExpression,
  structuralSimilarity };
