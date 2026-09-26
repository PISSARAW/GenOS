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

function pickRandom(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function weightedRandom(items, weights) { const sum = weights.reduce((a, b) => a + b, 0); let r = Math.random() * sum; for (let i = 0; i < items.length; i++) { r -= weights[i]; if (r <= 0) return items[i]; } return items[items.length - 1]; }

function generateMutationParams(type) {
  const params = { type };
  switch (type) {
    case 'ADD_NODE': params.topology = pickRandom(['trinity', 'rhizome', 'a_team', 'syncytium', 'biocenose']); break;
    case 'CHANGE_TOPOLOGY': params.newTopology = pickRandom(['trinity', 'rhizome', 'a_team', 'syncytium', 'biocenose']); break;
    case 'CHANGE_VARIANT': params.newVariant = pickRandom(['heterogeneous', 'adversarial', 'controlled', 'adaptive']); break;
    case 'ADD_BRIDGE': params.adapter = 'default'; break;
    case 'CHANGE_BUDGET': params.budgetDelta = { tokens: Math.floor(Math.random() * 1000) - 500 }; break;
  }
  return params;
}

function sampleMutations(probs, maxDepth) {
  const mutations = [];
  const depth = Math.floor(Math.random() * maxDepth) + 1;
  for (let i = 0; i < depth; i++) {
    const type = weightedRandom(Object.keys(probs), Object.values(probs));
    mutations.push({ type, ...generateMutationParams(type) });
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