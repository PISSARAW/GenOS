'use strict';

async function observeCycle(ctx, input) {
  const hierarchy = await input.routeHierarchyEvent(ctx, input.event);
  const agow = await require('./agow/agowRuntimeIngressService').process({ ctx,
    event: input.event, finalEvent: input.finalEvent });
  const predictive = await require('./runtimePredictiveBridgeService').process(ctx, input.event);
  return require('./conceptRuntimeService').processEvent(ctx.db, { agentId: ctx.agentId,
    event: input.event, observation: { hierarchy, agow, predictive } });
}

async function advanceFeedback(ctx, event) {
  await require('./orchestratorRuntimeFeedback').process(ctx, event);
  if (ctx.handleOrchestrationDecision) await ctx.handleOrchestrationDecision(ctx, event, event.eventType);
}

module.exports = { observeCycle, advanceFeedback };
