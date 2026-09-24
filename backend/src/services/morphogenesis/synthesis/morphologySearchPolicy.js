'use strict';

function chooseSearchScope(input = {}) {
  const evaluated = Array.isArray(input.evaluatedLocalMutations) ? input.evaluatedLocalMutations : [];
  const viable = evaluated.filter((candidate) => candidate && candidate.valid === true);
  if (viable.length) return { scope: 'local', candidates: viable, globalAllowed: false };
  if (input.localEvaluationComplete !== true) {
    return {
      scope: 'blocked', candidates: [], globalAllowed: false,
      reason: 'local mutation evaluation is incomplete'
    };
  }
  return {
    scope: 'global',
    candidates: Array.isArray(input.globalCandidates) ? input.globalCandidates : [],
    globalAllowed: true,
    reason: 'all generated local mutations were evaluated and none was viable'
  };
}

module.exports = { chooseSearchScope };
