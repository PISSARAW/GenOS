'use strict';

const spiral = require('../capabilities/unblockSpiral');

function distinctCandidates(candidates, input) {
  if (!Array.isArray(input.attemptHistory)) return candidates;
  return candidates.filter((candidate) => candidate.intervention
    && spiral.planNext({ attempts: input.attemptHistory,
      candidates: [candidate.intervention], maxScaleIndex: input.maxScaleIndex }).permitted);
}

function chooseSearchScope(input = {}) {
  const evaluated = Array.isArray(input.evaluatedLocalMutations) ? input.evaluatedLocalMutations : [];
  const viable = distinctCandidates(evaluated.filter((candidate) => candidate && candidate.valid === true), input);
  if (viable.length) return { scope: 'local', candidates: viable, globalAllowed: false };
  if (input.localEvaluationComplete !== true) {
    return {
      scope: 'blocked', candidates: [], globalAllowed: false,
      reason: 'local mutation evaluation is incomplete'
    };
  }
  return {
    scope: 'global',
    candidates: distinctCandidates(Array.isArray(input.globalCandidates) ? input.globalCandidates : [], input),
    globalAllowed: true,
    reason: 'all generated local mutations were evaluated and none was viable'
  };
}

module.exports = { chooseSearchScope };
