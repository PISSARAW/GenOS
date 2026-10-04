'use strict';

const spiral = require('../capabilities/unblockSpiral');
const evidenceStore = require('../capabilities/capabilityEvidenceStore');

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

async function chooseSearchScopePersisted(db, input = {}) {
  if (!db || !input.attemptScopeId) throw new Error('Persisted search requires database and attempt scope');
  const attempts = await evidenceStore.loadAttempts(db, input.attemptScopeId);
  const progression = spiral.scaleLimit({ ...input, attempts });
  const result = chooseSearchScope({ ...input, attemptHistory: attempts,
    maxScaleIndex: progression.maxScaleIndex });
  if (result.scope === 'global' && !result.candidates.length && input.globalCandidates?.length) {
    return { scope: 'blocked', candidates: [], globalAllowed: false,
      reason: 'SCALE_NOT_AUTHORIZED', progression };
  }
  return { ...result, progression };
}

module.exports = { chooseSearchScope, chooseSearchScopePersisted };
