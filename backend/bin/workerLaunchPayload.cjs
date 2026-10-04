'use strict';

function enrichMission(context, mission, role) {
  if (context.request?.mode === 'metapopulation') return migrationInstructions(mission);
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

function migrationInstructions(mission) {
  const review = String(mission).includes('TRANSFERABLE IDEAS ONLY');
  const contract = review
    ? 'Include top-level submission and migrationDecisions in your evidence JSON. For every supplied idea, report ideaId, decision, reason, localValidation, fitnessBefore, fitnessAfter, fitnessDirection and evidenceRefs. Do not mark an idea accepted unless the deterministic local evaluator independently reproduces a fitness improvement.'
    : 'Include top-level submission and transferableIdeas in your evidence JSON as bounded technique/counterexample objects {ideaId, technique, rationale, evidenceRefs}. Never include a complete solution, answer, schedule, or code as a transferable idea. Set migrationDecisions to an empty array.';
  return `${mission}\n\nMETAPOPULATION MIGRATION CONTRACT: ${contract}`;
}

function topologyInstructions(mission, session) {
  if (!session?.sessionId) return mission;
  return `${mission}\n\nSYNCYTIUM RE-GROUNDING: session_id=${session.sessionId}, initial_revision=${session.revision}. Before committing shared work and before each major decision, call genos_topology_session with operation "events", session_id, and after_revision equal to your last acknowledged revision. Incorporate every newer event into your reasoning, then continue from the highest revision received. Record the revision used in your result.\n\nSEMANTIC CROSS-VALIDATION: include top-level semanticClaims in your evidence report. Each claim must be {"subject":"stable concept", "predicate":"property", "value":string|number|boolean, "evidence":["source or observation"]}. State only claims you can support; use an empty array when you have none.`;
}

function isolatedBaselineInstructions(mission, context) {
  if (context.request?.mode !== 'isolated_baseline') return mission;
  return `${mission}\n\nISOLATED BASELINE: solve this assignment independently. Do not read or write shared topology state. Return evidence and top-level semanticClaims in your evidence report. Each claim must be {"subject":"stable concept", "predicate":"property", "value":string|number|boolean, "evidence":["source or observation"]}. State only supported claims; use an empty array when none apply.`;
}

function isolatedBaselineLease(context, lease) {
  if (context.request?.mode !== 'isolated_baseline') return lease || [];
  const sharedTools = new Set(['genos_worker_publish', 'genos_worker_inbox', 'genos_topology_session', 'genos_change_organization']);
  return (Array.isArray(lease) ? lease : []).filter((tool) => !sharedTools.has(String(tool).toLowerCase()));
}

function selectedExecutor(context) {
  return context.request?.executor || process.env.GENOS_AGENT_EXECUTOR || (context.request?.localModel ? 'local' : undefined);
}

function selectedModel(member, request) {
  return member.localModel || request?.localModel;
}

function localRuntimeFlag(member, request) {
  return member.engine === 'local' || Boolean(request?.localModel) ? { localRuntime: true } : {};
}

function selectedBudget(member, request) {
  const budget = request?.execution_budget || request?.executionBudget;
  return Number.isFinite(member.executionBudgetTokens)
    ? { ...(budget || {}), tokens: member.executionBudgetTokens }
    : budget;
}

function selectedRoutingPolicy(member, localModel) {
  return member.localRoutingPolicy || (localModel ? {
    primary: localModel, fallbacks: [], parallelReview: [], mode: 'fallback', preferLocal: true
  } : undefined);
}

function workerLaunchPayload(args) {
  const { context, member, workerId, parent, capabilities, capabilityManifest, toolLease } = args;
  const workerKind = require('../src/services/agents/workerKindService').resolveWorkerKind(member.workerKind, member.role);
  const baseMission = enrichMission(context, member.mission || '', member.role);
  const mission = topologyInstructions(isolatedBaselineInstructions(baseMission, context), context.topologySession);
  const localModel = selectedModel(member, context.request);
  return {
    action: 'dispatch_worker',
    background: false,
    orchestratorId: context.orchestratorId,
    workerId,
    mission,
    role: member.role,
    workerKind,
    variantIndex: member.variantIndex,
    localModel,
    localRoutingPolicy: selectedRoutingPolicy(member, localModel),
    missionScope: member.missionScope,
    methodContract: member.methodContract,
    workerAssignment: member.workerAssignment,
    topologySessionId: context.topologySession?.sessionId || null,
    model_tier: member.modelTier,
    capabilities: capabilities || [],
    capabilityManifest: capabilityManifest || null,
    toolLease: isolatedBaselineLease(context, toolLease),
    execution_budget: selectedBudget(member, context.request),
    timeoutMs: context.request?.timeoutMs,
    workspace_root: context.request?.workspace_root || parent?.workspace_root || process.env.GENOS_WORKSPACE_ROOT,
    reuseChecked: true,
    reuseWorkerId: workerId,
    executor: selectedExecutor(context),
    ...localRuntimeFlag(member, context.request),
  };
}

module.exports = { workerLaunchPayload };
