'use strict';
async function process(ctx, event) {
  await require('./orchestratorRuntimeFeedback').process(ctx, event);
  if (ctx.handleOrchestrationDecision) await ctx.handleOrchestrationDecision(ctx, event, event.eventType);
}
module.exports = { process };
