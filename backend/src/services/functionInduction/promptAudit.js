'use strict';

async function record(ctx, promptText) {
  const method = ctx.mission.workerContract?.mission?.methodContract || ctx.mission.methodContract;
  if (method?.evaluator?.domain !== require('./contract').DOMAIN) return;
  const hash = require('../biologicalIntegrity').digest;
  const event = require('../agentOrchestrationState').emit(ctx.mission.agentId, 'FUNCTION_INDUCTION_PROMPT',
    'INFERENCE_INPUT', 'Recorded the exact bounded induction prompt before provider invocation.', {
      executionRunId: ctx.executionRun.id, promptText, promptHash: hash(promptText),
      publicContextHash: hash(method.parameters.context), localContextTokens: ctx.mission.localContextTokens
    }, 'info', 'running');
  await require('../strategyExecutionService').recordExecutionEvent(ctx.db, ctx.mission.agentId, event);
}

module.exports = {record};
