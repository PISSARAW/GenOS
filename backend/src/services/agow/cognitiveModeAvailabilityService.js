'use strict';

const ACTIVE = new Set(['shadow', 'advisory', 'bounded', 'live']);

async function eligibleModes(input) {
  const policy = await require('./agowMechanismPolicyService').load(input);
  const frame = input.frame;
  const gap = frame.unresolvedQuestions.length || frame.epistemicState.contradiction
    || frame.epistemicState.uncertainty >= 0.5 || frame.causalContext.predictionError >= 0.5;
  const allowed = {
    ACT: !frame.riskContext?.requiresGlobalReview,
    OBSERVE: input.allowActiveQuery !== false && Boolean(gap),
    VERIFY: input.allowActiveQuery !== false && Boolean(gap),
    RECALL: input.allowActiveQuery !== false,
    SIMULATE: canSimulate(input, policy),
    REORGANIZE: ACTIVE.has(policy.markets),
    CONSOLIDATE: ACTIVE.has(policy.proceduralization),
    ABSTAIN: true
  };
  for (const mode of Object.keys(input.modeExecutors || {})) {
    if (mode === 'REORGANIZE' || mode === 'CONSOLIDATE') allowed[mode] = true;
  }
  return Object.keys(allowed).filter((mode) => allowed[mode]);
}

function canSimulate(input, policy) {
  return input.counterfactual !== false && policy.counterfactual !== 'disabled'
    && require('./counterfactual/shadowWorkspaceService').hasExecutor({ execute: input.counterfactualExecutor });
}

module.exports = { eligibleModes };
