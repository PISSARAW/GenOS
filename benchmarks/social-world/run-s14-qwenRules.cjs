'use strict';

function mainRule1(context) {
  return context.observed.action === 'SIGNAL'
      && context.JSON.stringify(context.observed.recipients) === context.JSON.stringify(['agent-b'])
      && context.JSON.stringify(context.observed.semanticRefs) === context.JSON.stringify(['question:neighbor:cartography'])
      && context.observed.publicSummary === context.questionResult.answer.question
      && context.questionCount === 1
      && context.questionResult.answer.question.split(/\s+/).length <= 35;
}

function mainRule2(context) {
  return { campaignId: 'socialworld-qwen-20261022', scenario: 'S14', seed: context.seed,
      status: 'fail', model: context.MODEL, sourceCommit: context.sourceCommit, error: context.error.stack || context.error.message,
      selectedDomain: context.selection, qwenQuestion: context.questionResult?.answer, observed: context.observed,
      stage: context.observed ? 'delivery-verification' : context.selection ? 'qwen-question' : 'curiosity-selection',
      verified: false, durationMs: context.Date.now() - context.startedAt };
}

function mainRule3(context) {
  return context.questionResult.answer.question.match(/\?/g) || [];
}

module.exports = { mainRule1, mainRule2, mainRule3 };
