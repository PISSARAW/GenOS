'use strict';

function mainRule1(context) {
  return context.firstHop.rootHash === context.source.payloadHash && context.secondHop.rootHash === context.source.payloadHash
      && context.firstHop.delivered && context.secondHop.delivered && context.duplicate.duplicate && !context.duplicate.delivered
      && context.rumorRejected && context.chainValid && context.linked;
}

function mainRule2(context) {
  return { campaignId: 'socialworld-qwen-20261022', scenario: 'S25', seed: context.seed,
      status: 'fail', model: context.MODEL, sourceCommit: context.sourceCommit, error: context.error.stack || context.error.message,
      firstHop: context.firstHop, secondHop: context.secondHop, observed: context.observed, enginePass: context.enginePass, qwenResponse: context.qwenResponse, verified: false,
      stage: context.enginePass ? 'qwen-verification' : 'genos-provenance-propagation', durationMs: context.Date.now() - context.startedAt };
}

module.exports = { mainRule1, mainRule2 };
