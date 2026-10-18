'use strict';

const { applyMutations, MUTATION_HANDLERS } = require('./mutationOperators');
const { createMorphogenContext, computeMutationProbabilities, getBaseMutationProbabilities, generateMutationParams, sampleMutations, MUTATION_TYPES, MORPHOGEN_SIGNALS } = require('./morphogenContext');
const { createCandidate } = require('./morphologyCandidate');

function generateCandidates(seedExpression, morphogenContext, options = {}) {
  const { count = 10, maxDepth = 3 } = options;
  const baseProbs = getBaseMutationProbabilities();
  const probs = computeMutationProbabilities(morphogenContext, baseProbs);
  const candidates = [];

  for (let i = 0; i < count; i++) {
    const generation = Math.max(1, Number(options.generation) || 1);
    const candidateIndex = i + Math.max(0, Number(options.candidateOffset) || 0);
    const identityPrefix = `${options.searchId || 'search'}:${generation}:${candidateIndex}`;
    const mutations = sampleMutations(probs, maxDepth, {
      expression: seedExpression, random: options.random, identityPrefix
    });
    const expression = applyMutations(seedExpression, mutations);
    candidates.push(createCandidate({ expression, mutations, generation,
      parentIds: options.parentCandidateId ? [options.parentCandidateId] : [],
      operator: 'MUTATION', probability: mutationProbability(mutations, probs),
      searchBudget: options.searchBudget }));
  }

  return candidates;
}

function mutationProbability(mutations, probs) { return mutations.reduce((p, m) => p * (probs[m.type] || 0.1), 1); }

module.exports = { MUTATION_TYPES, MORPHOGEN_SIGNALS, createMorphogenContext, computeMutationProbabilities, applyMutations, generateCandidates, generateMutationParams, MUTATION_HANDLERS };
