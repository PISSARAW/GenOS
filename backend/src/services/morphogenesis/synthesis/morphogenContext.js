'use strict';

const MORPHOGEN_SIGNALS = Object.freeze([
  'uncertainty', 'contradiction', 'novelty', 'evidence_gap',
  'coupling', 'contention', 'staleness', 'stall',
  'failure', 'diversity_loss', 'coordination_cost',
  'resource_pressure', 'adversarial_pressure'
]);

function createMorphogenContext(signals = {}) {
  const ctx = { signals: {}, weights: {} };
  for (const signal of MORPHOGEN_SIGNALS) {
    ctx.signals[signal] = signals[signal] || 0;
    ctx.weights[signal] = 1.0;
  }
  return ctx;
}

function computeMutationProbabilities(morphogenContext, baseProbs = {}) {
  const probs = { ...baseProbs };
  const { signals, weights } = morphogenContext;

  const effects = {
    uncertainty: { ADD_NODE: 1.5, CHANGE_TOPOLOGY: 1.3, NEST: 1.2 },
    contradiction: { CHANGE_VARIANT: 1.5, ADD_NODE: 1.2, SPLIT: 1.3 },
    novelty: { ADD_NODE: 1.4, CHANGE_TOPOLOGY: 1.3, ADD_EDGE: 1.2 },
    evidence_gap: { ADD_NODE: 1.3, NEST: 1.2, CHANGE_TOPOLOGY: 1.2 },
    coupling: { UNNEST: 1.3, REWIRE: 1.4, CHANGE_COMMUNICATION_POLICY: 1.3 },
    contention: { SPLIT: 1.4, MOVE_SUBTREE: 1.3, CHANGE_BUDGET: 1.2 },
    staleness: { REPLACE_NODE: 1.3, CHANGE_VARIANT: 1.2, THAW: 1.2 },
    stall: { ADD_NODE: 1.3, SPLIT: 1.2, NEST: 1.2 },
    failure: { REPLACE_NODE: 1.5, CHANGE_TOPOLOGY: 1.4, ADD_BRIDGE: 1.3 },
    diversity_loss: { ADD_NODE: 1.4, CHANGE_VARIANT: 1.3, SPLIT: 1.2 },
    coordination_cost: { UNNEST: 1.3, REWIRE: 1.2, CHANGE_COMMUNICATION_POLICY: 1.2 },
    resource_pressure: { RESIZE_POPULATION: 1.3, CHANGE_BUDGET: 1.4, REMOVE_NODE: 1.2 },
    adversarial_pressure: { CHANGE_VARIANT: 1.5, ADD_NODE: 1.3, NEST: 1.2 }
  };

  for (const [signal, value] of Object.entries(signals)) {
    if (value <= 0) continue;
    const weight = weights[signal] || 1.0;
    const effect = effects[signal];
    if (!effect) continue;
    for (const [mutation, multiplier] of Object.entries(effect)) {
      if (probs[mutation]) probs[mutation] *= 1 + (multiplier - 1) * value * weight;
    }
  }

  return normalizeProbabilities(probs);
}

function normalizeProbabilities(probs) {
  const sum = Object.values(probs).reduce((a, b) => a + b, 0);
  if (sum === 0) return probs;
  const normalized = {};
  for (const [k, v] of Object.entries(probs)) normalized[k] = v / sum;
  return normalized;
}

function getBaseMutationProbabilities() {
  const probs = {};
  const types = [
    'ADD_NODE', 'REMOVE_NODE', 'REPLACE_NODE',
    'NEST', 'UNNEST', 'SPLIT', 'MERGE', 'MOVE_SUBTREE',
    'CHANGE_TOPOLOGY', 'CHANGE_VARIANT', 'RESIZE_POPULATION',
    'ADD_EDGE', 'REMOVE_EDGE', 'REWIRE',
    'ADD_BRIDGE', 'REMOVE_BRIDGE',
    'MIGRATE_WORKER', 'MIGRATE_STATE',
    'CHANGE_BUDGET', 'CHANGE_COMMUNICATION_POLICY', 'CHANGE_EVIDENCE_POLICY',
    'FREEZE', 'THAW', 'QUIESCE', 'PROMOTE', 'DEMOTE'
  ];
  for (const type of types) probs[type] = 1.0;
  return probs;
}

function pickRandom(arr, random = Math.random) { return arr[Math.floor(random() * arr.length)]; }
function weightedRandom(items, weights, random = Math.random) { const sum = weights.reduce((a, b) => a + b, 0); let r = random() * sum; for (let i = 0; i < items.length; i++) { r -= weights[i]; if (r <= 0) return items[i]; } return items[items.length - 1]; }

function topologyChoices() {
  return Object.keys(require('../registry/topologyRegistry').DEFINITIONS);
}

function variantChoices(topology) {
  if (topology === 'metapopulation') {
    return [...require('../../metapopulation/policy/metapopulationPolicyService').DOCUMENTED_VARIANTS];
  }
  return require('../registry/variantCatalog').topologyVariants(topology).map((entry) => entry.variantId);
}

function mutationChoices(type, expression) {
  const current = expression?.kind === 'TOPOLOGY' ? expression.topology : null;
  if (type === 'CHANGE_TOPOLOGY') return topologyChoices().filter((topology) => topology !== current);
  if (type === 'CHANGE_VARIANT' && current) {
    return variantChoices(current).filter((variant) => variant !== expression.variant);
  }
  if (type === 'CHANGE_VARIANT') return [];
  return topologyChoices();
}

function applicableMutation(type, expression) {
  if (type === 'CHANGE_TOPOLOGY') return mutationChoices(type, expression).length > 0;
  if (type === 'CHANGE_VARIANT') return mutationChoices(type, expression).length > 0;
  return ['ADD_NODE', 'RESIZE_POPULATION', 'CHANGE_BUDGET',
    'CHANGE_COMMUNICATION_POLICY', 'CHANGE_EVIDENCE_POLICY'].includes(type);
}

function generatedNodeId(options, type) {
  return `${options.identityPrefix || 'mutation'}:${options.mutationIndex || 0}:${type}`;
}

const SIMPLE_PARAM_BUILDERS = Object.freeze({
  RESIZE_POPULATION: (random) => ({ newSize: 1 + Math.floor(random() * 8) }),
  CHANGE_BUDGET: (random) => ({ budgetDelta: { tokens: Math.floor(random() * 1000) - 500 } }),
  CHANGE_COMMUNICATION_POLICY: (random) => ({
    newPolicy: pickRandom(['minimal', 'bounded', 'evidence_only'], random)
  }),
  CHANGE_EVIDENCE_POLICY: (random) => ({
    newPolicy: pickRandom(['strict', 'quorum', 'independent'], random)
  })
});

function generateMutationParams(type, options = {}) {
  const params = { type };
  const random = options.random || Math.random;
  if (SIMPLE_PARAM_BUILDERS[type]) {
    return { ...params, ...SIMPLE_PARAM_BUILDERS[type](random) };
  }
  switch (type) {
    case 'ADD_NODE':
      params.topology = pickRandom(topologyChoices(), random);
      params.variant = pickRandom(variantChoices(params.topology), random);
      params.createdNodeId = generatedNodeId(options, type);
      break;
    case 'CHANGE_TOPOLOGY':
      params.newTopology = pickRandom(mutationChoices(type, options.expression), random);
      params.newVariant = pickRandom(variantChoices(params.newTopology), random);
      break;
    case 'CHANGE_VARIANT':
      if (!options.expression || options.expression.kind !== 'TOPOLOGY') {
        throw new Error('CHANGE_VARIANT requires a topology expression');
      }
      params.newVariant = pickRandom(mutationChoices(type, options.expression), random);
      break;
  }
  return params;
}

function sampleMutations(probs, maxDepth, options = {}) {
  const mutations = [];
  const random = options.random || Math.random;
  const depth = Math.floor(random() * maxDepth) + 1;
  let expression = options.expression ? structuredClone(options.expression) : null;
  for (let i = 0; i < depth; i++) {
    const available = Object.entries(probs)
      .filter(([type]) => applicableMutation(type, expression));
    if (!available.length) break;
    const type = weightedRandom(available.map(([name]) => name), available.map(([, weight]) => weight), random);
    const mutation = generateMutationParams(type, { expression, random,
      identityPrefix: options.identityPrefix, mutationIndex: i });
    mutations.push(mutation);
    if (expression) expression = require('./mutationOperators').applySingleMutation(expression, mutation);
  }
  return mutations;
}

function mutationProbability(mutations, probs) { return mutations.reduce((p, m) => p * (probs[m.type] || 0.1), 1); }

const MUTATION_TYPES = [
  'ADD_NODE', 'REMOVE_NODE', 'REPLACE_NODE',
  'NEST', 'UNNEST', 'SPLIT', 'MERGE', 'MOVE_SUBTREE',
  'CHANGE_TOPOLOGY', 'CHANGE_VARIANT', 'RESIZE_POPULATION',
  'ADD_EDGE', 'REMOVE_EDGE', 'REWIRE',
  'ADD_BRIDGE', 'REMOVE_BRIDGE',
  'MIGRATE_WORKER', 'MIGRATE_STATE',
  'CHANGE_BUDGET', 'CHANGE_COMMUNICATION_POLICY', 'CHANGE_EVIDENCE_POLICY',
  'FREEZE', 'THAW', 'QUIESCE', 'PROMOTE', 'DEMOTE'
];

module.exports = { createMorphogenContext, computeMutationProbabilities, getBaseMutationProbabilities, generateMutationParams, sampleMutations, mutationProbability, MUTATION_TYPES, MORPHOGEN_SIGNALS };
