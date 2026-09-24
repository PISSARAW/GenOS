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
  const { context, member, workerId, parent, capabilities, capabilityManifest, toolLease } = args;
  const workerKind = require('../src/services/agents/workerKindService').resolveWorkerKind(member.workerKind, member.role);
  const mission = enrichMission(context, member.mission || '', member.role);
  const budget = context.request?.execution_budget || context.request?.executionBudget;
  const executionBudget = Number.isFinite(member.executionBudgetTokens)
    ? { ...(budget || {}), tokens: member.executionBudgetTokens }
    : budget;
  return {
    action: 'dispatch_worker',
    background: false,
    orchestratorId: context.orchestratorId,
    workerId,
    mission,
    role: member.role,
    workerKind,
    model_tier: member.modelTier,
    capabilities: capabilities || [],
    capabilityManifest: capabilityManifest || null,
    toolLease: toolLease || [],
    execution_budget: executionBudget,
    timeoutMs: context.request?.timeoutMs,
    workspace_root: context.request?.workspace_root || parent?.workspace_root || process.env.GENOS_WORKSPACE_ROOT,
    reuseChecked: true,
  };
}

module.exports = { workerLaunchPayload };
