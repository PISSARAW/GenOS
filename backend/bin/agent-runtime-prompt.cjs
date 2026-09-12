/**
 * Agent runtime prompt building and plan compaction helpers.
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

  return [
    `${selfIntro}`,
    `Agent role: ${mission.role || 'Autonomous implementation agent'}.`,
    `${conscienceBlock}`,
    memoryBlock ? `${memoryBlock}` : '',
    authorityInstruction,
    gatingDirective ? `[BIOMIMETIC GATING]\n${gatingDirective}` : '',
    'Work directly in the assigned repository and implement the mission completely.',
    `Keep changes scoped to the repository, inspect existing code before editing, run relevant tests, and report concrete progress. Your final response must be a single JSON object with this schema: {"author":{"name":"${agentName}","meaning":"${nameMeaning}"},"outcome":"success|failed|no_answer","claims":[{"statement":"specific conclusion","evidence":["test output, receipt, or inspected artifact"]}],"uncertainties":["anything not verified"],"tests":["command and result"],"dossierInfluence":[{"workerId":"delegated worker id","usedClaims":["claim used or rejected"],"influence":"how this dossier changed or constrained the synthesis"}],"artifact":"creative when applicable","artifactText":"creative work when applicable","creativeEvaluation":{"rubric":{"craft":0,"coherence":0,"originality":0,"emotionalImpact":0,"constraintCoverage":0},"constraintCoverage":0,"revisions":[],"criticEvidence":[]},"failure":{"category":"unresolved_task|falsified_hypothesis|capability_mismatch|transient_runtime","reason":"why the mission failed","evidence":["concrete observations"]},"noAnswerProof":{"method":"bounded exhaustive method","evidence":["proof artifacts"]}}. If you cannot complete the mission, set outcome=failed and explain it explicitly; do not hide failure behind a successful process exit. Set outcome=no_answer only with concrete proof that no answer exists in the stated scope. Do not state a conclusion as fact without at least one evidence entry; use uncertainties instead.`,
    strategyContract.selected_strategy?.primary
      ? `Follow this auditable GenOS strategy contract. Primary strategy: ${strategyContract.selected_strategy.primary}.\nContract:\n${JSON.stringify(runtimeContract, null, 2)}\n\nExecutable Strategy Primitives: The 7 lots of GenOS primitives are executable via MCP tools (e.g. genos_strat_mcts_select, genos_strat_compile_memory, genos_strat_mutate, genos_strat_stdp_update, genos_strat_evaluate, genos_strat_bisect_agent, genos_strat_vfs_dry_run) or genos_execute_primitive. Invoke them at appropriate stages of the mission.`
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
    isWorker && effectiveLease.length ? `Your enforceable GenOS MCP lease is limited to: ${effectiveLease.join(', ')}.` : '',
    genosCapsule.id
      ? `Your active GenOS capsule is ${genosCapsule.id}. For capsule tools, pass capsule_id=${genosCapsule.id} and root=${genosCapsule.root}. This capsule was created by the control plane; do not invent or replace its identity.`
      : '',
    `Execution policy: file edits are ${allowFileEdits ? 'allowed inside this capsule' : 'not allowed'}; the only authorized shell commands are ${allowedCommands.length ? allowedCommands.map((command) => JSON.stringify(command)).join(', ') : 'none'}. Do not attempt any other shell command, including discovery or Git commands.`,
    `Mission:\n${mission.prompt || mission.currentTask || 'Inspect the repository and report the next safe action.'}`
  ].filter(Boolean).join('\n\n');
}

module.exports = {
  compactStrategyContract,
  compactAutonomyPlan,
  buildAgentRuntimePrompt
};
