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

function computeBranchCount(flags, maxWorkersFn, survival) {
  const requested = flags.security || flags.complex || flags.uncertain ? maxWorkersFn() : 1;
  const limit = survival.constraints.maxWorkerFanout;
  return limit === null ? requested : Math.min(requested, limit);
}

function applySurvivalConstraints(plan) {
  const limit = plan?.survival?.constraints?.maxWorkerFanout;
  if (limit === null || limit === undefined) return plan;
  const requestedWorkers = plan.workers.length;
  plan.workers = plan.workers.slice(0, limit);
  plan.dispatchWorkers = plan.dispatchWorkers.slice(0, limit);
  const workerShare = plan.dispatchWorkers.length ? plan.tokenPolicy.workerShare : 0;
  plan.tokenPolicy.workerShare = workerShare;
  plan.tokenPolicy.orchestratorReserve = plan.dispatchWorkers.length ? plan.tokenPolicy.orchestratorReserve : 1;
  plan.tokenPolicy.rounds = require('../tokenAllocationService').buildAllocation({
    totalTokens: plan.tokenPolicy.total,
    workerShare,
    workerCount: plan.dispatchWorkers.length,
    minimumWorkerTokens: plan.tokenPolicy.minimumWorkerTokens,
    mode: plan.tokenPolicy.allocation
  });
  plan.exploration = buildExploration(plan.workers, plan.dispatchWorkers);
  plan.dispatchDecision = buildDispatchDecision(plan.workers, plan.dispatchWorkers);
  plan.dispatchDecision.reason = plan.survival.constraints.suspend ? 'survival_dormancy' : 'homeostasis_guard';
  plan.survival.constraints.requestedWorkerFanout = requestedWorkers;
  plan.survival.constraints.appliedWorkerFanout = plan.dispatchWorkers.length;
  return plan;
}

function executionStatusOf(realizable, omittedPhases) {
  if (realizable.length === 0) return 'blocked';
  return omittedPhases.length ? 'blocked' : 'ready';
}

function buildAutonomyPlan(contract, budget = {}) {
  const profile = contract.problem_profile || {};
  const flags = profileFlags(profile);
  const modes = modeFlags(contract);
  const survival = evaluateSurvival({
    tokens: budget.tokens ?? 500000,
    uncertainty: profile.uncertainty,
    ...(budget.survivalState || {})
  });
  const branchCount = computeBranchCount(flags, maxWorkers, survival);
  const phases = buildPhases(flags, modes, branchCount);
  const portfolio = contract.strategy_portfolio || [];
  const realizable = filterPhasesToPortfolio(phases, portfolio);
  const phaseValidation = validatePhasesVsPortfolio(phases, portfolio);
  const omittedPhases = omitPhases(phases, phaseValidation);
  const branches = (contract.branches || []).slice(0, branchCount);
  const workers = buildWorkers(flags, branches).slice(0, branchCount);
  const requiredTools = [...new Set(realizable.flatMap((entry) => entry.requiredTools))];
  const tokenPlan = buildTokenPlan(budget, flags, workers);
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
      ? [{ code: 'NO_REALIZABLE_PHASES', message: 'The selected strategy portfolio cannot execute any autonomy phase.' }]
      : [],
    omittedPhases,
    remediation,
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

  applySurvivalConstraints(plan);
  plan.controlRegulation = regulateAutonomyPlan(contract, budget, plan);
  return plan;
}

module.exports = {
  get MAX_WORKERS() {
    return maxWorkers();
  },
  buildAutonomyPlan,
  applySurvivalConstraints,
  maxWorkers
};