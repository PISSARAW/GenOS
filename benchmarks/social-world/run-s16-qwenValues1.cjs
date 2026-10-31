'use strict';

function mainValue1(__genosValueScope1) {
  return __genosValueScope1.decision.scope === 'SELECTIVE_MULTICAST'
      && __genosValueScope1.JSON.stringify(__genosValueScope1.observed.recipients) === __genosValueScope1.JSON.stringify(__genosValueScope1.EXPECTED.recipients)
      && !__genosValueScope1.observed.recipients.includes('agent-d')
      && __genosValueScope1.JSON.stringify(__genosValueScope1.observed.semanticRefs) === __genosValueScope1.JSON.stringify(__genosValueScope1.EXPECTED.semanticRefs);
}

function mainValue2(__genosValueScope2) {
  return { campaignId: 'socialworld-qwen-20261022', scenario: 'S16', seed: __genosValueScope2.seed,
      status: 'fail', model: __genosValueScope2.MODEL, sourceCommit: __genosValueScope2.sourceCommit, error: __genosValueScope2.error.stack || __genosValueScope2.error.message,
      stage: __genosValueScope2.observed ? __genosValueScope2.warmup ? 'qwen-verification' : 'qwen-warmup' : 'genos-cycle',
      observed: __genosValueScope2.observed, decision: __genosValueScope2.decision, outcome: __genosValueScope2.outcome, enginePass: __genosValueScope2.enginePass, warmup: __genosValueScope2.warmup, verified: false, durationMs: __genosValueScope2.Date.now() - __genosValueScope2.startedAt };
}

module.exports = { mainValue1, mainValue2 };
