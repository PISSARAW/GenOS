/**
 * Agent runtime prompt builder — P2 zero-prompt refinement.
 *
 * Rules enforced by runtime (leases, sandbox, schema) are NOT repeated
 * in the prompt. The prompt contains only what the model must *understand*,
 * not what the runtime can *improve*.
 */

const path = require('path');
const fs = require('fs');

function compactStrategyContract(contract = {}, worker = false) {
  if (worker) {
    return {
      schema: contract.schema,
      selected_strategy: contract.selected_strategy,
      stop_conditions: contract.stop_conditions,
      promotion: contract.promotion
    };
  }
  return {
    schema: contract.schema,
    mission: contract.mission,
    problem_profile: contract.problem_profile,
    selected_strategy: contract.selected_strategy,
    strategy_portfolio: (contract.strategy_portfolio || []).map(({ id, role, primitives, score }) => ({ id, role, primitives, score })),
    execution_pipeline: contract.execution_pipeline,
    branches: (contract.branches || []).slice(0, 3),
    stop_conditions: contract.stop_conditions,
    promotion: contract.promotion
  };
}

function compactAutonomyPlan(plan = {}) {
  if (plan.synthesisOnly === true) {
    return {
      schema: plan.schema,
      synthesisOnly: true,
      completedWorkerIds: plan.completedWorkerIds || [],
      dossierInfluenceRequired: true,
      tokenPolicy: plan.tokenPolicy
    };
  }
  return {
    schema: plan.schema,
    synthesisOnly: plan.synthesisOnly === true,
    completedWorkerIds: plan.completedWorkerIds || [],
    profile: plan.profile,
    organization: plan.organization,
    organizationPolicy: plan.organizationPolicy,
    phases: (plan.phases || []).map(({ key, requiredTools, purpose }) => ({ key, requiredTools, purpose })),
    requiredTools: plan.requiredTools,
    dispatchWorkers: (plan.dispatchWorkers || []).map(({ label, hypothesis, role, modelTier }) => ({ label, hypothesis, role, modelTier })),
    competition: plan.competition,
    evolution: plan.evolution,
    parasitism: plan.parasitism,
    aTeam: plan.aTeam,
    trinity: plan.trinity,
    localModelReview: plan.localModelReview?.consulted ? {
      consulted: true,
      selectedModel: plan.localModelReview.selectedModel,
      provider: plan.localModelReview.provider,
      advice: String(plan.localModelReview.advice || '').slice(0, 4000),
      route: plan.localModelReview.route
    } : { consulted: false, error: plan.localModelReview?.error || null },
    tokenPolicy: plan.tokenPolicy
  };
}

/**
 * Build differential continuation context — only the delta, not the
 * accumulated prompt history.
 */
function buildContinuationContext(previous, dossier, assignedTokens) {
  const report = dossier ? JSON.stringify(dossier).slice(0, 8000) : '';
  return [
    `Continuation round. Budget: ${assignedTokens} tokens.`,
    report ? `Evidence delta:\n${report}` : '',
    'Resolve the highest-value uncertainty. Return only the updated evidence delta.',
  ].filter(Boolean).join('\n\n');
}

function buildAgentRuntimePrompt(ctx) {
  const {
    selfIntro, mission, conscienceBlock, memoryBlock, authorityInstruction,
    agentName, nameMeaning, strategyContract, runtimeContract, isWorker,
    autonomyPlan, runtimeAutonomyPlan, executionPolicy, toolLease, genosCapsule,
    allowFileEdits, allowedCommands
  } = ctx;

  const gating = ctx.toolGating || (ctx.enableToolGating ? require('../src/services/biomimeticToolGatingService').evaluateToolGating(mission.prompt || mission.currentTask, toolLease) : null);
  let effectiveLease = toolLease;
  let gatingDirective = '';
  if (gating && gating.gatingActive) {
    if (!gating.requiresTools) {
      effectiveLease = [];
      gatingDirective = 'Biomimetic Gating Active: Query is purely conversational/conceptual. Do not call or hallucinate external tools; respond directly in natural language.';
    } else if (Array.isArray(gating.disinhibitedTools) && gating.disinhibitedTools.length > 0) {
      effectiveLease = gating.disinhibitedTools;
      gatingDirective = `Biomimetic Gating Active: Selectively disinhibited tools for this mission: ${effectiveLease.join(', ')}.`;
    }
  }

  const outputSchemaRef = 'Output must conform to the schema at backend/bin/agent-output-schema.json';

  return [
    `${selfIntro}`,
    `Agent role: ${mission.role || 'Autonomous implementation agent'}.`,
    `${conscienceBlock}`,
    memoryBlock ? `${memoryBlock}` : '',
    authorityInstruction,
    gatingDirective ? `[BIOMIMETIC GATING]\n${gatingDirective}` : '',
    outputSchemaRef,
    strategyContract.selected_strategy?.primary
      ? `Follow this auditable GenOS strategy contract. Primary strategy: ${strategyContract.selected_strategy.primary}.\nContract:\n${JSON.stringify(runtimeContract, null, 2)}`
      : 'No explicit strategy contract was attached; use the safest verified execution path.',
    !isWorker && autonomyPlan.schema
      ? `Autonomous orchestration plan. Its phases and tools are decision gates, not a mandatory script: choose and invoke only the smallest safe tools justified by current evidence. Record every elected action and preserve replay/merge evidence before promotion:\n${JSON.stringify(runtimeAutonomyPlan, null, 2)}`
      : '',
    !isWorker && runtimeAutonomyPlan.localModelReview?.consulted
      ? 'The local-model review above is advisory evidence. Explicitly compare it with the strategy contract before dispatching, replaying, merging, or rejecting its recommendations; mention the accepted or rejected recommendations in your final evidence report.'
      : '',
    !isWorker && autonomyPlan.parasitism?.enabled
      ? 'Parasitic pressure is enabled for this risk profile. If—and only if—you can construct a schema-valid parasite/agent genome manifest inside an isolated capsule, run genos_parasitic_pressure there with evolution enabled; keep its report as evidence and never merge it automatically.'
      : '',
    !isWorker && executionPolicy.silentUpdates !== true
      ? 'Keep the user informed through genos_report_progress at meaningful milestones: when the active approach changes, a substantial unit finishes, a blocker appears, or the team enters final verification. Report concise outcomes and next steps, not internal chain-of-thought or every tool call.'
      : !isWorker ? 'The user explicitly requested silent execution. Do not call genos_report_progress; return only the final mission result.' : '',
    isWorker && effectiveLease.length ? `[LEASE] Tools: ${effectiveLease.join(', ')}.` : '',
    genosCapsule.id
      ? `[CAPSULE] ${genosCapsule.id} (root=${genosCapsule.root}). Created by control plane; do not modify identity.`
      : '',
    allowFileEdits ? '[EDIT] Allowed in capsule.' : '[EDIT] Not allowed.',
    `Mission:\n${mission.prompt || mission.currentTask || 'Inspect the repository and report the next safe action.'}`
  ].filter(Boolean).join('\n\n');
}

module.exports = {
  compactStrategyContract,
  compactAutonomyPlan,
  buildAgentRuntimePrompt,
  buildContinuationContext,
};
