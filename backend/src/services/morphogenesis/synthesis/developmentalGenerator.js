'use strict';

const { applyMutations, MUTATION_HANDLERS } = require('./mutationOperators');
const { createMorphogenContext, computeMutationProbabilities, getBaseMutationProbabilities, generateMutationParams, sampleMutations, MUTATION_TYPES, MORPHOGEN_SIGNALS } = require('./morphogenContext');

function generateCandidates(seedExpression, morphogenContext, options = {}) {
  const { count = 10, maxDepth = 3 } = options;
  const baseProbs = getBaseMutationProbabilities();
  const probs = computeMutationProbabilities(morphogenContext, baseProbs);
  const candidates = [];

  for (let i = 0; i < count; i++) {
    const mutations = sampleMutations(probs, maxDepth);
    const candidate = applyMutations(seedExpression, mutations);
    candidates.push({ expression: candidate, mutations, probability: mutationProbability(mutations, probs) });
  }

  return candidates;
}

function mutationProbability(mutations, probs) { return mutations.reduce((p, m) => p * (probs[m.type] || 0.1), 1); }

module.exports = { MUTATION_TYPES, MORPHOGEN_SIGNALS, createMorphogenContext, computeMutationProbabilities, applyMutations, generateCandidates, generateMutationParams, MUTATION_HANDLERS };