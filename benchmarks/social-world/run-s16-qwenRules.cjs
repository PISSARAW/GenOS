'use strict';

function mainRule1(context) {
  return context.decision.scope === 'SELECTIVE_MULTICAST'
      && context.JSON.stringify(context.observed.recipients) === context.JSON.stringify(context.EXPECTED.recipients)
      && !context.observed.recipients.includes('agent-d')
      && context.JSON.stringify(context.observed.semanticRefs) === context.JSON.stringify(context.EXPECTED.semanticRefs);
}

function mainRule2(context) {
  return { campaignId: 'socialworld-qwen-20261022', scenario: 'S16', seed: context.seed,
      status: 'fail', model: context.MODEL, sourceCommit: context.sourceCommit, error: context.error.stack || context.error.message,
      stage: context.observed ? context.warmup ? 'qwen-verification' : 'qwen-warmup' : 'genos-cycle',
      observed: context.observed, decision: context.decision, outcome: context.outcome, enginePass: context.enginePass, warmup: context.warmup, verified: false, durationMs: context.Date.now() - context.startedAt };
}

module.exports = { mainRule1, mainRule2 };
