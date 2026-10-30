'use strict';

function mainValue1(__genosValueScope1) {
  return __genosValueScope1.firstHop.rootHash === __genosValueScope1.source.payloadHash && __genosValueScope1.secondHop.rootHash === __genosValueScope1.source.payloadHash
      && __genosValueScope1.firstHop.delivered && __genosValueScope1.secondHop.delivered && __genosValueScope1.duplicate.duplicate && !__genosValueScope1.duplicate.delivered
      && __genosValueScope1.rumorRejected && __genosValueScope1.chainValid && __genosValueScope1.linked;
}

function mainValue2(__genosValueScope2) {
  return { campaignId: 'socialworld-qwen-20261022', scenario: 'S25', seed: __genosValueScope2.seed,
      status: 'fail', model: __genosValueScope2.MODEL, sourceCommit: __genosValueScope2.sourceCommit, error: __genosValueScope2.error.stack || __genosValueScope2.error.message,
      firstHop: __genosValueScope2.firstHop, secondHop: __genosValueScope2.secondHop, observed: __genosValueScope2.observed, enginePass: __genosValueScope2.enginePass, qwenResponse: __genosValueScope2.qwenResponse, verified: false,
      stage: __genosValueScope2.enginePass ? 'qwen-verification' : 'genos-provenance-propagation', durationMs: __genosValueScope2.Date.now() - __genosValueScope2.startedAt };
}

module.exports = { mainValue1, mainValue2 };
