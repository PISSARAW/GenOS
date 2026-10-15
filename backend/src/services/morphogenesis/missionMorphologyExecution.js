'use strict';

function compositeGraph(plan) {
  const graph = plan.morphogenesisPlan?.morphologyPatch?.graph;
  const root = graph?.nodes?.find((node) => node.nodeId === graph.rootNodeId);
  return root?.operator ? graph : null;
}

function runtimeFor(ctx, dependencies) {
  if (dependencies.runtime) return dependencies.runtime;
  const { MorphologyRuntime } = require('./runtime/morphologyRuntime');
  return new MorphologyRuntime({
    globalBudget: ctx.autonomyPlan.tokenPolicy?.rounds?.workerPool
      ? { tokens: ctx.autonomyPlan.tokenPolicy.rounds.workerPool }
      : ctx.autonomyPlan.morphogenesisPlan?.morphologyPatch?.graph?.globalBudget || {}
  });
}

function executionInput(ctx) {
  return {
    db: ctx.db,
    mission: ctx.normalizedMission.prompt || ctx.normalizedMission.currentTask || '',
    missionId: ctx.normalizedMission.missionId || ctx.agentId,
    workerResults: ctx.autonomyPlan.workerResults || [],
    authority: ctx.normalizedMission.toolLease || [],
    initialState: { topology: ctx.autonomyPlan.selectedTopology,
      transitions: ctx.autonomyPlan.morphogenesisTransitions || [] }
  };
}

async function executeCompositeMorphology(ctx, dependencies = {}) {
  const graph = compositeGraph(ctx.autonomyPlan);
  if (!graph) return { executed: false, reason: 'flat_morphology' };
  try {
    const result = await runtimeFor(ctx, dependencies).execute(graph, executionInput(ctx));
    ctx.autonomyPlan.morphogenesisCompositeResult = result;
    return { executed: true, graphId: graph.graphId, graphVersion: graph.version, result };
  } catch (cause) {
    throw Object.assign(new Error(`Composite Morphogenesis execution failed: ${cause.message}`), {
      code: 'MORPHOGENESIS_COMPOSITE_EXECUTION_FAILED', cause
    });
  }
}

module.exports = { executeCompositeMorphology, compositeGraph };
