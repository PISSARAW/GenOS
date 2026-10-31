'use strict';

function mainValue1(__genosValueScope1) {
  return __genosValueScope1.observed.action === 'SIGNAL'
      && __genosValueScope1.JSON.stringify(__genosValueScope1.observed.recipients) === __genosValueScope1.JSON.stringify(['agent-b'])
      && __genosValueScope1.JSON.stringify(__genosValueScope1.observed.semanticRefs) === __genosValueScope1.JSON.stringify(['question:neighbor:cartography'])
      && __genosValueScope1.observed.publicSummary === __genosValueScope1.questionResult.answer.question
      && __genosValueScope1.questionCount === 1
      && __genosValueScope1.questionResult.answer.question.split(/\s+/).length <= 35;
}

function mainValue2(__genosValueScope2) {
  return { campaignId: 'socialworld-qwen-20261022', scenario: 'S14', seed: __genosValueScope2.seed,
      status: 'fail', model: __genosValueScope2.MODEL, sourceCommit: __genosValueScope2.sourceCommit, error: __genosValueScope2.error.stack || __genosValueScope2.error.message,
      selectedDomain: __genosValueScope2.selection, qwenQuestion: __genosValueScope2.questionResult?.answer, observed: __genosValueScope2.observed,
      stage: __genosValueScope2.observed ? 'delivery-verification' : __genosValueScope2.selection ? 'qwen-question' : 'curiosity-selection',
      verified: false, durationMs: __genosValueScope2.Date.now() - __genosValueScope2.startedAt };
}

function mainValue3(__genosValueScope3) {
  return __genosValueScope3.questionResult.answer.question.match(/\?/g) || [];
}

module.exports = { mainValue1, mainValue2, mainValue3 };
