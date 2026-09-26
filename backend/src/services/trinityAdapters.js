'use strict';

const ADAPTERS = Object.freeze({
  factorial_grid_executor: adapter('./trinityFactorialGrid', 'worldTopology:factorial_grid',
    ['generateFactorialGrid', 'anovaAnalysis', 'hierarchicalModel', 'varianceCorrection']),
  recursive_trinity_executor: adapter('./trinityRecursiveExecutor', 'worldTopology:recursive_nesting',
    ['executeRecursiveTrinity', 'identifySubProblems', 'selectSubProblem', 'shouldRecurse']),
  recursive_decomposition_planner: adapter('./trinityRecursiveExecutor', 'hypothesisPolicy:recursive_decomposition',
    ['identifySubProblems', 'selectSubProblem', 'shouldRecurse']),
  temporal_horizon_executor: adapter('./trinityTemporalHorizons', 'worldTopology:temporal_horizons',
    ['analyzeTemporalWorld', 'compareTemporalWorlds', 'temporalParetoFrontier']),
  temporal_value_model: adapter('./trinityTemporalHorizons', 'temporalPolicy:short_medium_long',
    ['temporalValueFunction', 'decomposeEffects']),
  temporal_grid_executor: adapter('./trinityTemporalHorizons', 'temporalPolicy:multi_horizon_grid',
    ['compareTemporalWorlds', 'temporalParetoFrontier']),
  oracular_executor: adapter('./trinityOracle', 'worldTopology:oracular_prediction',
    ['predictPerformance', 'scorePrediction', 'recordCalibration']),
  oracle_predictor: adapter('./trinityOracle', 'hypothesisPolicy:oracle_prediction',
    ['predictPerformance', 'brierScore', 'logLoss', 'routingWeights']),
  exploratory_novelty_executor: adapter('./trinityNoveltyArchive', 'worldTopology:exploratory_novelty',
    ['qualityDiversitySelect', 'scheduleReplicas']),
  novelty_archive: adapter('./trinityNoveltyArchive', 'hypothesisPolicy:novelty_seeking',
    ['addBehavior', 'noveltyScore']),
  qd_replica_scheduler: adapter('./trinityNoveltyArchive', 'replicationPolicy:quality_diversity_replicas',
    ['scheduleReplicas', 'qualityDiversitySelect']),
  counterfactual_fork_executor: adapter('./trinityCounterfactualFork', 'hypothesisPolicy:counterfactual_dimensions',
    ['runCounterfactualTrinity', 'analyzeCounterfactualResults', 'computeDelta']),
  diversity_planner: adapter('./trinityDiversityPlanner', 'diversityPolicy:heterogeneous',
    ['planDiverseWorlds', 'validateDiversity', 'tripletDiversity']),
  provider_diversity_enforcer: adapter('./trinityDiversityPlanner', 'diversityPolicy:provider_diverse',
    ['enforceProviderDiversity', 'validateDiversity']),
  adversarial_cross_examiner: adapter('./trinityAdversarialCrossExamination', 'interactionPolicy:adversarial_cross_examination',
    ['crossExamine', 'attackPhase', 'defendPhase', 'adjudicate']),
  blind_jury_adjudicator: adapter('./trinityBlindJuryService', 'interactionPolicy:jury_deliberation,adjudicationPolicy:blind_jury_advisory',
    ['evaluate']),
  pareto_objective_assigner: adapter('./trinityParetoService', 'objectivePolicy:pareto_orthogonal',
    ['compare', 'normalizeWorld']),
  multi_objective_scalarizer: adapter('./trinityParetoService', 'objectivePolicy:multi_objective_scalarized',
    ['compare', 'normalizeWorld']),
  adaptive_budget_scheduler: adapter('./trinityAdaptiveBudgetService', 'replicationPolicy:adaptive_budget_fixed_replicas',
    ['allocate']),
  sequential_design_scheduler: adapter('./trinityAdaptiveSequential', 'replicationPolicy:adaptive_replica_count',
    ['sequentialAllocate', 'stoppingRule', 'computeBiasCorrectedEstimate'])
});

function adapter(modulePath, serves, functions) {
  return Object.freeze({ module: modulePath, serves, functions: Object.freeze([...functions]) });
}

function adapterError(code, message) {
  return Object.assign(new Error(message), { code });
}

function adapterNames() {
  return Object.keys(ADAPTERS);
}

function describeAdapter(name) {
  const entry = ADAPTERS[name];
  if (!entry) throw adapterError('TRINITY_ADAPTER_UNKNOWN', `Unknown Trinity adapter '${name}'.`);
  return { name, module: entry.module, serves: entry.serves, functions: [...entry.functions] };
}

function resolveAdapter(name) {
  const entry = ADAPTERS[name];
  if (!entry) throw adapterError('TRINITY_ADAPTER_UNKNOWN', `Unknown Trinity adapter '${name}'.`);
  try {
    return require(entry.module);
  } catch (error) {
    throw adapterError('TRINITY_ADAPTER_MISSING', `Trinity adapter '${name}' cannot be loaded from '${entry.module}': ${error.message}.`);
  }
}

function isInstalled(name) {
  try {
    resolveAdapter(name);
    return true;
  } catch (_) {
    return false;
  }
}

function installedAdapterNames() {
  return adapterNames().filter(isInstalled);
}

module.exports = { ADAPTERS, adapterNames, describeAdapter, resolveAdapter, isInstalled, installedAdapterNames };
