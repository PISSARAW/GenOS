'use strict';

function workerLaunchPayload(args) {
  const { context, member, workerId, parent } = args;
  // Enrichissement NCE du prompt si disponible
  let mission = member.mission || '';
  if (context.nceEnrichments) {
    const topologyNCE = require('../src/services/topologyNCEService');
    mission = topologyNCE.enrichWorkerPromptSync(member.mission, {
      topology: context.nceEnrichments.topology,
      role: member.role,
      domain: context.nceEnrichments.domain,
      keywords: context.nceEnrichments.keywords,
      curiosity: context.nceEnrichments.curiosity,
      representations: context.nceEnrichments.representations,
      exaptations: context.nceEnrichments.exaptations,
      culturalTraits: context.nceEnrichments.culturalTraits,
      explorationDomains: context.nceEnrichments.explorationDomains,
    });
  }
  return {
    action: 'dispatch_worker',
    background: false,
    orchestratorId: context.orchestratorId,
    workerId,
    mission,
    role: member.role,
    model_tier: member.modelTier,
    ...(member.name ? { name: member.name } : {}),
    execution_budget: context.request?.execution_budget || context.request?.executionBudget,
    timeoutMs: context.request?.timeoutMs,
    workspace_root: context.request?.workspace_root || parent?.workspace_root || process.env.GENOS_WORKSPACE_ROOT,
    reuseChecked: true,
  };
}

module.exports = { workerLaunchPayload };
