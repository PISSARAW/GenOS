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

function selectedExecutor(context) {
  return context.request?.executor || process.env.GENOS_AGENT_EXECUTOR;
}

function localRuntimeFlag(member) {
  return member.engine === 'local' ? { localRuntime: true } : {};
}

function workerLaunchPayload(args) {
  const { context, member, workerId, parent, capabilities, capabilityManifest, toolLease } = args;
  const workerKind = require('../src/services/agents/workerKindService').resolveWorkerKind(member.workerKind, member.role);
  const mission = topologyInstructions(enrichMission(context, member.mission || '', member.role), context.topologySession);
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
    methodContract: member.methodContract,
    workerAssignment: member.workerAssignment,
    model_tier: member.modelTier,
    capabilities: capabilities || [],
    capabilityManifest: capabilityManifest || null,
    toolLease: toolLease || [],
    execution_budget: executionBudget,
    timeoutMs: context.request?.timeoutMs,
    workspace_root: context.request?.workspace_root || parent?.workspace_root || process.env.GENOS_WORKSPACE_ROOT,
    reuseChecked: true,
    reuseWorkerId: workerId,
    executor: selectedExecutor(context),
    ...localRuntimeFlag(member),
  };
}

module.exports = { workerLaunchPayload };
