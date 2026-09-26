/**
 * Agent runtime prompt builder — P2 zero-prompt refinement.
 *
 * Rules enforced by runtime (leases, sandbox, schema) are NOT repeated
 * in the prompt. The prompt contains only what the model must *understand*,
 * not what the runtime can *enforce*.
 */

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

function buildContinuationContext(previous, dossier, assignedTokens) {
  const report = dossier ? JSON.stringify(dossier).slice(0, 8000) : '';
  return [
    `Continuation round. Budget: ${assignedTokens} tokens.`,
    report ? `Evidence delta:\n${report}` : '',
    'Resolve the highest-value uncertainty. Return only the updated evidence delta.',
  ].filter(Boolean).join('\n\n');
}

function resolveToolGating(ctx) {
  return ctx.toolGating || (ctx.enableToolGating ? require('../src/services/biomimeticToolGatingService').evaluateToolGating(ctx.mission.prompt || ctx.mission.currentTask, ctx.toolLease) : null);
}

function applyToolGating(toolLease, gating) {
  if (!gating || !gating.gatingActive) return { effectiveLease: toolLease, directive: '' };
  if (!gating.requiresTools) return { effectiveLease: [], directive: 'Biomimetic Gating Active: Query is purely conversational/conceptual. Do not call or hallucinate external tools; respond directly in natural language.' };
  if (Array.isArray(gating.disinhibitedTools) && gating.disinhibitedTools.length > 0) return { effectiveLease: gating.disinhibitedTools, directive: `Biomimetic Gating Active: Selectively disinhibited tools for this mission: ${gating.disinhibitedTools.join(', ')}.` };
  return { effectiveLease: toolLease, directive: '' };
}

function buildStrategyBlock(runtimeContract, strategyContract) {
  return strategyContract.selected_strategy?.primary ? `Follow this auditable GenOS strategy contract. Primary strategy: ${strategyContract.selected_strategy.primary}.\nContract:\n${JSON.stringify(runtimeContract, null, 2)}` : 'No explicit strategy contract was attached; use the safest verified execution path.';
}

function buildAutonomyBlock(isWorker, autonomyPlan, runtimeAutonomyPlan) {
  if (isWorker || !autonomyPlan.schema) return '';
  return `Autonomous orchestration plan. Its phases and tools are decision gates, not a mandatory script: choose and invoke only the smallest safe tools justified by current evidence. Record every elected action and preserve replay/merge evidence before promotion:\n${JSON.stringify(runtimeAutonomyPlan, null, 2)}`;
}

function buildSilenceBlock(isWorker, executionPolicy) {
  if (isWorker) return '';
  return executionPolicy.silentUpdates !== true ? 'Keep the user informed through genos_report_progress at meaningful milestones: when the active approach changes, a substantial unit finishes, a blocker appears, or the team enters final verification. Report concise outcomes and next steps, not internal chain-of-thought or every tool call.' : 'The user explicitly requested silent execution. Do not call genos_report_progress; return only the final mission result.';
}

function buildLeaseHint(isWorker, effectiveLease) {
  return isWorker && effectiveLease.length ? `[LEASE] Tools: ${effectiveLease.join(', ')}.` : '';
}

function buildAbstentionHint(mission) {
  if (!mission || !mission.abstentionRecommended) return '';
  return `[ABSTENTION]\nCalibration requires abstention over confabulation (${mission.abstentionRecommended.reason}). If evidence is insufficient, return no_answer with method and examined states instead of an unverified claim.`;
}

function buildNonInteractiveHint(executionPolicy) {
  if (!executionPolicy || executionPolicy.nonInteractive !== true) return '';
  return `[NON-INTERACTIVE]\nNON-INTERACTIVE MODE: Do not ask for user confirmation. Execute autonomously using the available tools and report progress via genos_report_progress.`;
}

function buildFileEditHint(isWorker, allowFileEdits) {
  return !isWorker && allowFileEdits ? `[FILE EDIT]\nFILE EDIT ENABLED: You may create, modify, or delete files within the workspace using file editing tools.` : '';
}

function buildCommandHint(isWorker, allowedCommands) {
  return !isWorker && allowedCommands && allowedCommands.length > 0 ? `[COMMANDS]\nCOMMANDS ALLOWED: You may execute the following shell commands: ${allowedCommands.join(', ')}.` : '';
}

function buildCapsuleHint(isolation, capsuleId) {
  return `[CAPSULE] Isolation: ${isolation}. Capsule ID: ${capsuleId}.`;
}

function buildWorkspaceHint(wsRoot) {
  return `[WORKSPACE] Root: ${wsRoot}`;
}

function buildReviewHint(isWorker, runtimeAutonomyPlan) {
  if (isWorker || !runtimeAutonomyPlan.localModelReview?.consulted) return '';
  return 'The local-model review above is advisory evidence. Explicitly compare it with the strategy contract before dispatching, replaying, merging, or rejecting its recommendations; mention the accepted or rejected recommendations in your final evidence report.';
}

function buildParasitismHint(isWorker, autonomyPlan) {
  if (isWorker || !autonomyPlan.parasitism?.enabled) return '';
  return 'Parasitic pressure is enabled for this risk profile. If—and only if—you can construct a schema-valid parasite/agent genome manifest inside an isolated capsule, run genos_parasitic_pressure there with evolution enabled; keep its report as evidence and never merge it automatically.';
}

function buildAgentRuntimePrompt(ctx) {
  const params = {
    selfIntro: ctx.selfIntro,
    mission: ctx.mission,
    conscienceBlock: ctx.conscienceBlock,
    agentSelfBlock: ctx.agentSelfBlock || '',
    memoryBlock: ctx.memoryBlock,
    workerSelfBlock: ctx.workerSelfBlock || '',
    authorityInstruction: ctx.authorityInstruction,
    strategyContract: ctx.strategyContract,
    runtimeContract: ctx.runtimeContract,
    isWorker: ctx.isWorker,
    autonomyPlan: ctx.autonomyPlan,
    runtimeAutonomyPlan: ctx.runtimeAutonomyPlan,
    executionPolicy: ctx.executionPolicy,
    toolLease: ctx.toolLease,
    genosCapsule: ctx.genosCapsule,
    isolationMode: ctx.isolationMode,
    workspacePath: ctx.workspacePath,
    allowFileEdits: ctx.allowFileEdits,
    allowedCommands: ctx.allowedCommands,
    enableToolGating: ctx.enableToolGating,
    capabilityManifest: ctx.capabilityManifest,
    capabilities: ctx.capabilities,
  };

  const gating = resolveToolGating(params);
  const { effectiveLease, directive: gatingDirective } = applyToolGating(params.toolLease, gating);
  const capsuleId = params.genosCapsule ? `${params.genosCapsule.id}_run_${Date.now()}` : '';
  const isolation = params.isolationMode || 'Branch';
  const wsRoot = params.workspacePath || process.env.GENOS_WORKSPACE_ROOT || '';

  return [
    `${params.selfIntro}`,
    `Agent role: ${params.mission.role || 'Autonomous implementation agent'}.`,
    params.agentSelfBlock || '',
    params.workerSelfBlock || '',
    `${params.conscienceBlock}`,
    params.memoryBlock ? `${params.memoryBlock}` : '',
    params.authorityInstruction || '',
    gatingDirective ? `[BIOMIMETIC GATING]\n${gatingDirective}` : '',
    buildCapabilityBlock(params.isWorker, params.capabilities, params.capabilityManifest),
    buildStrategyBlock(params.runtimeContract, params.strategyContract),
    buildAutonomyBlock(params.isWorker, params.autonomyPlan, params.runtimeAutonomyPlan),
    buildReviewHint(params.isWorker, params.runtimeAutonomyPlan),
    buildParasitismHint(params.isWorker, params.autonomyPlan),
    buildSilenceBlock(params.isWorker, params.executionPolicy),
    buildLeaseHint(params.isWorker, effectiveLease),
    buildAbstentionHint(params.mission),
    buildNonInteractiveHint(params.executionPolicy),
    buildFileEditHint(params.isWorker, params.allowFileEdits),
    buildCommandHint(params.isWorker, params.allowedCommands),
    buildCapsuleHint(isolation, capsuleId),
    buildWorkspaceHint(wsRoot),
  ].filter(Boolean).join('\n\n');
}

function buildCapabilityBlock(isWorker, capabilities, manifest) {
  if (!isWorker) return '';
  const items = [];
  if (Array.isArray(capabilities) && capabilities.length) {
    items.push(`Capabilities: ${capabilities.join(', ')}.`);
  }
  if (manifest && manifest.currently_expressed && manifest.currently_expressed.length) {
    const entries = manifest.currently_expressed.slice(0, 5).map((e) => {
      return e.capability_id ? `${e.capability_id} (${e.utility != null ? e.utility.toFixed(2) : 'n/a'})` : null;
    }).filter(Boolean);
    if (entries.length) items.push(`Manifest: ${entries.join(', ')}.`);
  }
  return items.length ? `[CAPABILITY]\n${items.join(' ')}` : '';
}

module.exports = {
  compactStrategyContract,
  compactAutonomyPlan,
  buildAgentRuntimePrompt,
  buildContinuationContext,
  buildCapabilityBlock,
};
