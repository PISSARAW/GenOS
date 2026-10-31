const { profileFlags } = require('./profileFlags');
const { modeFlags } = require('./modeFlags');
const { buildPhases, validatePhasesVsPortfolio, filterPhasesToPortfolio, omitPhases } = require('./phaseBuilder');
const { buildWorkers } = require('./workerBuilder');
const { buildTokenPlan } = require('./tokenPlanner');
const { resolveOrganization, buildOrganizationPolicy } = require('./organizationPolicy');
const { buildExploration, buildDispatchDecision } = require('./dispatchDecision');
const { buildCompetition, buildEvolution, buildParasitism } = require('./capabilities');
const { buildRemediation } = require('./remediation');
const { buildRegistry, buildTokenPolicyView } = require('./views');
const { evaluateSurvival } = require('../survivalModelService');
const { regulateAutonomyPlan } = require('../controlRegulationService');
const { maxWorkers } = require('./config');
const { resolveWorkerRosterRequest } = require('../workerRosterRequestService');
const { buildWorkerRoster } = require('../workerRosterPlanner');

function computeBranchCount(flags, survival, portfolio) {
  const requested = flags.security || flags.complex || flags.uncertain ? maxWorkers() : 1;
  const limit = survival.constraints.maxWorkerFanout;
  const bounded = limit === null ? requested : Math.min(requested, limit);
  if (flags.security || bounded <= 1) return bounded;
  const primitives = new Set(portfolio.flatMap((strategy) => strategy.primitives || []));
  return primitives.has('fork') && primitives.has('solve') ? bounded : 1;
}

function applySurvivalConstraints(plan) {
  const limit = plan?.survival?.constraints?.maxWorkerFanout;
  if (limit === null || limit === undefined) return plan;
  const requestedWorkers = plan.workers.length;
  plan.workers = plan.workers.slice(0, limit);
  plan.dispatchWorkers = plan.dispatchWorkers.slice(0, limit);
  if (plan.dispatchWorkers.length) {
    require('../aTeamDispatchBudgetService').applyWorkerBudget(
      plan.tokenPolicy, plan.dispatchWorkers);
  } else {
    plan.tokenPolicy.workerShare = 0;
    plan.tokenPolicy.orchestratorReserve = 1;
    plan.tokenPolicy.workerBudgets = [];
    plan.tokenPolicy.rounds = require('../tokenAllocationService').buildAllocation({
      totalTokens: plan.tokenPolicy.total, workerShare: 0, workerCount: 0,
      minimumWorkerTokens: plan.tokenPolicy.minimumWorkerTokens,
      workerBudgets: [], mode: plan.tokenPolicy.allocation
    });
  }
  plan.exploration = buildExploration(plan.workers, plan.dispatchWorkers);
  plan.dispatchDecision = buildDispatchDecision(
    plan.workers, plan.dispatchWorkers, plan.tokenPolicy.admission);
  plan.dispatchDecision.reason = plan.survival.constraints.suspend ? 'survival_dormancy' : (plan.dispatchDecision.reason || 'homeostasis_guard');
  plan.survival.constraints.requestedWorkerFanout = requestedWorkers;
  plan.survival.constraints.appliedWorkerFanout = plan.dispatchWorkers.length;
  return plan;
}

function executionStatusOf(realizable, omittedPhases) {
  if (realizable.length === 0) return 'blocked';
  return omittedPhases.length ? 'blocked' : 'ready';
}

function resolveAutonomyTask(missionRequest, contract) {
  return String(missionRequest.mission || missionRequest.task || contract.mission || '');
}

function resolveSurvivalState(budget, profile) {
  return evaluateSurvival({
    tokens: budget.tokens ?? 500000,
    uncertainty: profile.uncertainty,
    ...(budget.survivalState || {})
  });
}

function buildAutonomyPlan(contract, budget = {}, missionRequest = {}) {
  const profile = contract.problem_profile || {};
  const task = resolveAutonomyTask(missionRequest, contract);
  const workerRoster = resolveWorkerRosterRequest(missionRequest, task);
  const flags = profileFlags(profile);
  flags.factualReadOnly = contract.evaluation_mode === 'factual_read_only';
  flags.formalReadOnly = contract.evaluation_mode === 'formal_read_only';
  const modes = modeFlags(contract);
  const survival = resolveSurvivalState(budget, profile);
  const portfolio = contract.strategy_portfolio || [];
  const branchCount = computeBranchCount(flags, survival, portfolio);
  const phases = buildPhases(flags, modes, branchCount);
  const realizable = filterPhasesToPortfolio(phases, portfolio);
  const phaseValidation = validatePhasesVsPortfolio(phases, portfolio);
  const omittedPhases = omitPhases(phases, phaseValidation);
  const branches = (contract.branches || []).slice(0, branchCount);
  const defaultWorkers = buildWorkers(flags, branches).slice(0, branchCount);
  const workers = buildWorkerRoster(workerRoster, task, defaultWorkers);
  const requiredTools = [...new Set(realizable.flatMap((entry) => entry.requiredTools))];
  const tokenBudget = workerRoster?.exact ? { ...budget, atomicTopology: true } : budget;
  const tokenPlan = buildTokenPlan(tokenBudget, flags, workers);
  const executionStatus = executionStatusOf(realizable, omittedPhases);
  const dispatchWorkers = tokenPlan.dispatchWorkers;
  const remediation = buildRemediation(realizable, omittedPhases);

  const plan = {
    schema: 'genos.autonomous-orchestration/v1alpha1',
    survival,
    registry: buildRegistry(portfolio),
    profile,
    organization: resolveOrganization(contract, flags.security),
    organizationPolicy: buildOrganizationPolicy(contract, flags.security),
    decisionGates: require('../autonomousOrchestrationGates').decisionGates(),
    phases: realizable,
    executionStatus,
    executionBlockers: executionStatus === 'blocked'
      ? [executionBlocker(realizable)]
      : [],
    omittedPhases,
    remediation,
    exploration: buildExploration(workers, dispatchWorkers),
    requiredTools,
    mandatoryTools: [...requiredTools],
    workers,
    dispatchWorkers,
    ...(workerRoster ? { workerRoster: { requestedWorkers: workerRoster.requestedWorkers,
      requestedTasks: workerRoster.requestedTasks, exact: workerRoster.exact,
      typePolicy: workerRoster.typePolicy, selectedWorkers: dispatchWorkers.length,
      workerKinds: dispatchWorkers.map((worker) => worker.workerKind) } } : {}),
    dispatchDecision: buildDispatchDecision(workers, dispatchWorkers, tokenPlan.admission),
    competition: buildCompetition(contract, modes.competition),
    evolution: buildEvolution(contract, modes.evolution),
    parasitism: buildParasitism(flags),
    tokenPolicy: buildTokenPolicyView(contract, tokenPlan)
  };

  applySurvivalConstraints(plan);
  enforceRequestedWorkerCount(plan, workerRoster);
  plan.controlRegulation = regulateAutonomyPlan(contract, budget, plan);
  return plan;
}

function enforceRequestedWorkerCount(plan, roster) {
  if (!roster?.exact || !roster.requestedWorkers) return;
  const selected = plan.dispatchWorkers.length;
  const configuredLimit = maxWorkers();
  if (selected === roster.requestedWorkers && roster.requestedWorkers <= configuredLimit) return;
  const message = roster.requestedWorkers > configuredLimit
    ? `Exact worker request requires ${roster.requestedWorkers} workers; configured maximum is ${configuredLimit}.`
    : `Exact worker request requires ${roster.requestedWorkers} workers; only ${selected} can be selected under current capacity and budget.`;
  plan.workerRoster.admission = { status: 'blocked', code: 'WORKER_CARDINALITY_UNSATISFIABLE',
    requestedWorkers: roster.requestedWorkers, selectedWorkers: selected, reason: message };
  plan.workerRoster.selectedWorkers = selected;
  plan.dispatchWorkers = [];
  plan.dispatchDecision = { status: 'blocked', code: 'WORKER_CARDINALITY_UNSATISFIABLE',
    requestedWorkers: roster.requestedWorkers, selectedWorkers: selected, reason: message };
  plan.executionStatus = 'blocked';
  plan.executionBlockers = [...(plan.executionBlockers || []), {
    code: 'WORKER_CARDINALITY_UNSATISFIABLE', message
  }];
}

function executionBlocker(realizable) {
  if (realizable.length === 0) {
    return { code: 'NO_REALIZABLE_PHASES', message: 'The selected strategy portfolio cannot execute any autonomy phase.' };
  }
  return {
    code: 'REQUIRED_PHASES_UNAVAILABLE',
    message: 'One or more required autonomy phases are unavailable in the selected strategy portfolio.'
  };
}

module.exports = {
  get MAX_WORKERS() {
    return maxWorkers();
  },
  buildAutonomyPlan,
  applySurvivalConstraints,
  maxWorkers
};
