const { listStrategies } = require('../strategies/strategyRegistry');
const { buildAllocation } = require('./tokenAllocationService');
const { ORGANIZATIONS } = require('./dynamicOrganizationService');
const { PRIMITIVE_ALIASES, decisionGates, organizationTransitions } = require('./autonomousOrchestrationGates');

function maxWorkers() {
  return Math.max(1, Number(process.env.GENOS_MAX_WORKERS || process.env.GENOS_MAX_AUTONOMOUS_WORKERS || process.env.GENOS_MAX_ACTIVE_WORKERS) || 8);
}

function selected(contract, id) {
  return (contract.strategy_portfolio || []).some((strategy) => strategy.id === id);
}

function hasTrait(contract, trait) {
  const registry = new Map(listStrategies().map((strategy) => [strategy.id, strategy]));
  return (contract.strategy_portfolio || []).some((strategy) => registry.get(strategy.id)?.traits.includes(trait));
}

function phase(key, requiredTools, purpose) {
  return { key, requiredTools, purpose, required: true };
}

function workerRole([label, hypothesis, role, modelTier]) {
  return { label, hypothesis, role, modelTier };
}

function toolHasPrimitive(tool, portfolioPrimitives) {
  const primitiveName = String(tool).replace(/^genos_/, '');
  const aliases = PRIMITIVE_ALIASES[primitiveName] || [primitiveName];
  return portfolioPrimitives.has(primitiveName) || portfolioPrimitives.has(tool) || aliases.some((alias) => portfolioPrimitives.has(alias));
}

function missingToolsForPhase(phaseTools, portfolioPrimitives) {
  const missing = [];
  for (const tool of phaseTools || []) {
    if (!toolHasPrimitive(tool, portfolioPrimitives)) {
      missing.push(tool);
    }
  }
  return missing;
}

function validatePhasesVsPortfolio(phases, portfolio = []) {
  const portfolioPrimitives = new Set((portfolio || []).flatMap((s) => s.primitives || []));
  const missingByPhase = {};
  for (const p of phases || []) {
    const missing = missingToolsForPhase(p.requiredTools, portfolioPrimitives);
    if (missing.length > 0) {
      missingByPhase[p.key] = missing;
    }
  }
  return { missingByPhase, canProceed: Object.keys(missingByPhase).length === 0 };
}

function filterPhasesToPortfolio(phases, portfolio = []) {
  const validation = validatePhasesVsPortfolio(phases, portfolio);
  const missingPhases = new Set(Object.keys(validation.missingByPhase));
  return phases.filter((p) => !missingPhases.has(p.key));
}

function omitPhases(phases, phaseValidation) {
  return phases
    .filter((entry) => phaseValidation.missingByPhase[entry.key])
    .map((entry) => ({ key: entry.key, missingTools: phaseValidation.missingByPhase[entry.key], required: entry.required }));
}

function profileFlags(profile) {
  return {
    highRisk: profile.risk === 'high',
    complex: Number(profile.complexity || 0) >= 0.65,
    uncertain: Number(profile.uncertainty || 0) >= 0.6,
    security: profile.type === 'security'
  };
}

function modeFlags(contract) {
  return {
    competition: selected(contract, 'strategy_arena') || selected(contract, 'genetic_strategy_algorithm') || hasTrait(contract, 'multi_objective'),
    evolution: selected(contract, 'genetic_strategy_algorithm') || hasTrait(contract, 'mutation')
  };
}

function computeBranchCount(flags, maxWorkersFn) {
  return flags.security || flags.complex || flags.uncertain ? maxWorkersFn() : 1;
}

function buildPhases(flags, modes, branchCount) {
  const phases = [
    phase('retrieve_and_diagnose', ['genos_search_failures', 'genos_diagnose'], 'Retrieve negative knowledge and establish falsifiable hypotheses.'),
    phase('snapshot_before_mutation', ['genos_snapshot'], 'Create a recoverable baseline before any risky mutation.')
  ];
  if (branchCount > 1) phases.push(phase('counterfactual_forks', ['genos_fork', 'genos_solve'], 'Explore independent hypotheses in isolated branches.'));
  phases.push(phase('evidence_and_evaluation', ['genos_hypothesis_evidence', 'genos_evaluate_trajectories'], 'Score evidence and suspend dominated trajectories.'));
  if (modes.evolution) phases.push(phase('controlled_mutation', ['genos_resilience_hypermutation'], 'Use bounded mutation only after a baseline and evidence exist.'));
  if (modes.competition) phases.push(phase('competition_and_selection', ['genos_adversarial_review'], 'Run adversarial comparison and select a Pareto-safe winner.'));
  if (flags.security) phases.push(phase('red_queen', ['genos_security_coevolution'], 'Run Red/Blue/neutral-observer coevolution in isolated worlds.'));
  phases.push(phase('replay_and_promote', ['genos_replay', 'genos_record_decision'], 'Replay the selected result and preserve the rationale before promotion.'));
  return phases;
}

function buildWorkers(flags, branches) {
  if (flags.security) {
    return [
      workerRole(['red', 'Find adversarial failure modes.', 'red_team', 'frontier']),
      workerRole(['blue', 'Defend against the red-team findings.', 'blue_team', 'frontier']),
      workerRole(['observer', 'Independently verify claims and veto unsupported conclusions.', 'neutral_observer', 'standard'])
    ];
  }
  return branches.map((branch, index) => workerRole([
    branch.label,
    branch.hypothesis,
    index === 0 ? 'implementation' : 'independent_reviewer',
    index === 0 ? 'frontier' : 'standard'
  ]));
}

function clampUnit(value) {
  return Math.max(0, Math.min(1, value));
}

function resolveShare(value, fallback) {
  return Number.isFinite(Number(value)) ? clampUnit(Number(value)) : fallback;
}

function tokenPolicyValue(budget, key) {
  return (budget.tokenPolicy || {})[key];
}

function resolveTotalTokens(budget, workerCount) {
  const fallback = workerCount > 10 ? Math.max(500000, workerCount * 20000) : 500000;
  return Number(budget.tokens ?? fallback);
}

function resolveMinimumWorkerTokens(budget, workerCount) {
  const fallback = workerCount > 10 ? 1000 : 8000;
  return Number(budget.minimumWorkerTokens ?? fallback);
}

function buildTokenPlan(budget, flags, workers) {
  const totalTokens = resolveTotalTokens(budget, workers.length);
  const minimumWorkerTokens = resolveMinimumWorkerTokens(budget, workers.length);
  const workerShare = resolveShare(budget.workerShare, resolveShare(tokenPolicyValue(budget, 'workerShare'), 0.6));
  const orchestratorReserve = resolveShare(budget.orchestratorReserve, resolveShare(tokenPolicyValue(budget, 'orchestratorReserve'), 1 - workerShare));
  const minimumViableWorkerShare = workers.length && totalTokens >= minimumWorkerTokens ? minimumWorkerTokens / totalTokens : workerShare;
  const effectiveWorkerShare = Math.max(workerShare, minimumViableWorkerShare);
  const affordableWorkers = Math.max(0, Math.floor((totalTokens * effectiveWorkerShare) / minimumWorkerTokens));
  const dispatchWorkers = workers.slice(0, Math.min(workers.length, affordableWorkers));
  const allocation = flags.complex || flags.uncertain ? 'successive_halving_with_reallocation' : 'equal_minimum_then_score_weighted';
  const rounds = buildAllocation({
    totalTokens, workerShare: dispatchWorkers.length ? effectiveWorkerShare : 0, workerCount: dispatchWorkers.length,
    minimumWorkerTokens, mode: allocation
  });
  return { totalTokens, minimumWorkerTokens, effectiveWorkerShare, orchestratorReserve, dispatchWorkers, allocation, rounds };
}

function executionStatusOf(realizable, omittedPhases) {
  if (realizable.length === 0) return 'blocked';
  return omittedPhases.length ? 'blocked' : 'ready';
}

function collectiveId(contract) {
  return (contract.strategy_portfolio || []).find((strategy) => strategy.family === 'collective')?.id || 'network_silence';
}

function resolveOrganization(contract, security) {
  return security ? 'red_blue_coevolution' : collectiveId(contract);
}

function buildOrganizationPolicy(contract, security) {
  return {
    initial: resolveOrganization(contract, security),
    authority: 'orchestrator_may_change_at_any_decision_gate',
    availableOrganizations: Object.keys(ORGANIZATIONS),
    communicationModes: [...new Set(Object.values(ORGANIZATIONS).map((entry) => entry.exchange))],
    transitions: organizationTransitions()
  };
}

function buildExploration(workers, dispatchWorkers) {
  return {
    requestedBranches: workers.length,
    selectedBranches: dispatchWorkers.length,
    available: dispatchWorkers.length > 1,
    reason: dispatchWorkers.length > 1
      ? 'multiple_workers_budgeted'
      : workers.length
        ? 'budget_or_capacity_allows_at_most_one_worker'
        : 'no_independent_branches_declared'
  };
}

function buildDispatchDecision(workers, dispatchWorkers) {
  if (dispatchWorkers.length) {
    return { status: 'planned', requestedWorkers: workers.length, selectedWorkers: dispatchWorkers.length, reason: 'budget_and_capacity_satisfied' };
  }
  if (workers.length) {
    return { status: 'deferred', requestedWorkers: workers.length, selectedWorkers: 0, reason: 'worker_budget_below_minimum' };
  }
  return { status: 'not_required', requestedWorkers: 0, selectedWorkers: 0, reason: 'no_worker_assignments' };
}

function buildCompetition(contract, competition) {
  return competition
    ? { enabled: true, mode: selected(contract, 'strategy_arena') ? 'strategy_arena' : 'pareto_selection' }
    : { enabled: false };
}

function buildEvolution(contract, evolution) {
  return evolution
    ? { enabled: true, mode: selected(contract, 'genetic_strategy_algorithm') ? 'genetic_strategy_algorithm' : 'bounded_hypermutation' }
    : { enabled: false };
}

function buildParasitism(flags) {
  return { enabled: flags.highRisk || flags.security, mode: 'adversarial_parasite_branch', action: 'isolate_and_score_parasitic_trajectories' };
}

function buildTokenPolicyView(contract, plan) {
  return {
    total: plan.totalTokens,
    workerShare: plan.dispatchWorkers.length ? plan.effectiveWorkerShare : 0,
    orchestratorReserve: plan.dispatchWorkers.length ? plan.orchestratorReserve : 1,
    allocation: plan.allocation,
    minimumWorkerTokens: plan.minimumWorkerTokens,
    stopConditions: contract.stop_conditions || [],
    rounds: plan.rounds
  };
}

function buildRegistry(portfolio) {
  return { total: listStrategies().length, selected: portfolio.map((strategy) => strategy.id) };
}

function buildAutonomyPlan(contract, budget = {}) {
  const profile = contract.problem_profile || {};
  const flags = profileFlags(profile);
  const modes = modeFlags(contract);
  const branchCount = computeBranchCount(flags, maxWorkers);
  const phases = buildPhases(flags, modes, branchCount);
  const portfolio = contract.strategy_portfolio || [];
  const realizable = filterPhasesToPortfolio(phases, portfolio);
  const phaseValidation = validatePhasesVsPortfolio(phases, portfolio);
  const omittedPhases = omitPhases(phases, phaseValidation);
  const branches = (contract.branches || []).slice(0, branchCount);
  const workers = buildWorkers(flags, branches);
  const requiredTools = [...new Set(realizable.flatMap((entry) => entry.requiredTools))];
  const tokenPlan = buildTokenPlan(budget, flags, workers);
  const executionStatus = executionStatusOf(realizable, omittedPhases);
  const dispatchWorkers = tokenPlan.dispatchWorkers;

  return {
    schema: 'genos.autonomous-orchestration/v1alpha1',
    registry: buildRegistry(portfolio),
    profile,
    organization: resolveOrganization(contract, flags.security),
    organizationPolicy: buildOrganizationPolicy(contract, flags.security),
    decisionGates: decisionGates(),
    phases: realizable,
    executionStatus,
    executionBlockers: executionStatus === 'blocked'
      ? [{ code: 'NO_REALIZABLE_PHASES', message: 'The selected strategy portfolio cannot execute any autonomy phase.' }]
      : [],
    omittedPhases,
    exploration: buildExploration(workers, dispatchWorkers),
    requiredTools,
    workers,
    dispatchWorkers,
    dispatchDecision: buildDispatchDecision(workers, dispatchWorkers),
    competition: buildCompetition(contract, modes.competition),
    evolution: buildEvolution(contract, modes.evolution),
    parasitism: buildParasitism(flags),
    tokenPolicy: buildTokenPolicyView(contract, tokenPlan)
  };
}

module.exports = {
  get MAX_WORKERS() {
    return maxWorkers();
  },
  maxWorkers,
  buildAutonomyPlan
};
