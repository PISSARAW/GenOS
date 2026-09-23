'use strict';

function enrichMission(context, mission, role) {
  if (!context.nceEnrichments) return mission;
  const topologyNCE = require('../src/services/topologyNCEService');
  const enrichments = context.nceEnrichments;
  return topologyNCE.enrichWorkerPromptSync(mission, {
    topology: enrichments.topology || 'worker',
    role,
    domain: enrichments.domain || context.request?.domain,
    keywords: enrichments.keywords || context.request?.keywords || [],
    curiosity: enrichments.curiosity,
    representations: enrichments.representations,
    exaptations: enrichments.exaptations,
    culturalTraits: enrichments.culturalTraits,
    explorationDomains: enrichments.explorationDomains,
  });
}

function workerLaunchPayload(args) {
  const { context, member, workerId, parent } = args;
  // Adaptateur worker unique : enrichissement NCE + champs dispatch.
  const mission = enrichMission(context, member.mission || '', member.role);
  return {
    action: 'dispatch_worker',
    background: false,
    orchestratorId: context.orchestratorId,
    workerId,
    mission,
    role: member.role,
    model_tier: member.modelTier,
    ...(member.name ? { name: member.name } : {}),
    ...(Array.isArray(member.dependsOn) && member.dependsOn.length ? { depends_on: member.dependsOn } : {}),
    ...(member.pipelineStage ? { pipeline_stage: member.pipelineStage } : {}),
    ...(member.engine === 'local' ? { localRuntime: true } : {}),
    execution_budget: context.request?.execution_budget || context.request?.executionBudget,
    timeoutMs: context.request?.timeoutMs,
    workspace_root: context.request?.workspace_root || parent?.workspace_root || process.env.GENOS_WORKSPACE_ROOT,
    reuseChecked: true,
  };
}

module.exports = { workerLaunchPayload };
