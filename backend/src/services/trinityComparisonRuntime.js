'use strict';
const trinityService = require('./trinityService');
const adversarial = require('./trinityAdversarialCrossExamination');
const crossExamination = require('./trinityCrossExaminationService');
const claimGraph = require('./trinityClaimGraphService');
const jury = require('./trinityBlindJuryService');
const verifier = require('./trinityMissionVerifierService');
const temporal = require('./trinityTemporalHorizons');
const variantRuntime = require('./trinityVariantRuntime');
const recursiveExecutor = require('./trinityRecursiveExecutor');
const nestedMissionRunner = require('./trinityNestedMissionRunner');
const adaptiveContinuation = require('./trinityAdaptiveContinuationRunner');
const noveltyArchive = require('./trinityNoveltyArchive');

async function compareMission(db, input, reports) {
  return require('./trinityExecutionJournal').resumeComparison({ db, input }, reports,
    (initial, phase) => executeComparison({ db, input, reports: initial, phase }));
}

async function executeComparison(context) {
  const { db, input, reports, phase } = context;
  const expected = input.variantSelection?.experimentalDesign?.worldTopology === 'factorial_grid' ? 16 : 3;
  if (!completeInitialWorlds(reports, expected)) {
    const result = trinityService.mergeTrinityEvidence(reports, { expectedWorlds: expected });
    return { ...result, canMerge: false, selectedWorld: null, mergedEvidence: null, outcome: 'ESCALATE_EXPERIMENT', reason: 'initial_world_execution_incomplete' };
  }
  const design = { ...input.hypothesisDesign, centralProblem: input.mission, variantSelection: input.variantSelection || {} };
  const adaptiveReview = await phase('adaptive', () => runAdaptiveReview({ db, input, reports }));
  const sequentialReview = await phase('sequential', () => require('./trinitySequentialRunner').run({ db, input, reports }));
  const qdReview = await phase('qd', () => runQualityDiversityReview({ db, input, reports }));
  const activeReports = sequentialReview?.status === 'executed' ? sequentialReview.reports : qdReview?.status === 'executed' ? qdReview.reports
    : adaptiveReview?.status === 'executed' ? adaptiveReview.reports : reports;
  const examined = await phase('cross_examination', () => crossExamination.examine(db, activeReports, design));
  const worlds = verifier.verifyMissionReports(examined.reports, input.mission);
  const temporalReview = runTemporalReview(input.variantSelection, worlds);
  const recursiveReview = await phase('recursive', () => runRecursiveReview({ db, input, worlds }));
  const review = await phase('adversarial', () => adversarial.runVariantReview({ db, agentId: input.orchestratorId, design, worlds }));
  const graph = claimGraph.build(worlds, design.claimGraph);
  let result = trinityService.mergeTrinityEvidence(worlds, {
    domain: trinityService.analyzeMission(input.mission).domain,
    threshold: 0.70, claimGraph: graph, variantSelection: input.variantSelection,
    expectedWorlds: worlds.length, maxLatencyMs: input.maxLatencyMs,
    dimensionThresholds: { ...input.hypothesisDesign?.dimensionThresholds, ...input.dimensionThresholds }
  });
  result = adversarial.enforceVariantGate(result, review);
  result = enforceAdaptiveGate(result, adaptiveReview);
  result = enforceRecursiveGate(result, recursiveReview);
  const variantExecution = variantRuntime.run({ selection: input.variantSelection, reports: worlds });
  if (Object.keys(variantExecution.executions).length) result.comparativeAnalysis.variantExecution = variantExecution;
  result.jury = await phase('jury', () => jury.evaluate({
    db, agentId: input.orchestratorId, outcome: result.outcome,
    mission: input.mission, config: input.juryConfig, reports: worlds,
    required: input.variantSelection?.experimentalDesign?.adjudicationPolicy === 'blind_jury_advisory'
      || input.variantSelection?.experimentalDesign?.interactionPolicy === 'jury_deliberation',
    deterministicWinner: result.selectedWorld
  }));
  attachComparisonEvidence(result, { review, temporalReview, recursiveReview, adaptiveReview, qdReview, sequentialReview, examined, graph, design });
  if (result.jury.status !== 'unavailable') {
    await jury.recordCalibration({ db, experimentId: input.missionId, juryResult: result.jury,
      deterministicOutcome: { selectedWorld: result.selectedWorld } });
  }
  return enforceRequiredVariantGates({ result, input, temporalReview, recursiveReview,
    adaptiveReview, qdReview, sequentialReview, variantExecution, review, worlds });
}

function completeInitialWorlds(reports, expected) {
  if (reports.length !== expected || new Set(reports.map(world => world.worldNumber)).size !== expected) return false;
  return reports.every(world => successfulInitialWorld(world, expected));
}

function successfulInitialWorld(world, expected) {
  return Number.isInteger(world.worldNumber) && world.worldNumber >= 1 && world.worldNumber <= expected
    && world.report?.outcome === 'success' && !world.report.failure;
}

function attachComparisonEvidence(result, context) {
  const { review, temporalReview, recursiveReview, adaptiveReview, qdReview, examined, graph } = context;
  const entries = [
    ['adversarialReview', review], ['temporalReview', temporalReview],
    ['recursiveExecution', recursiveReview], ['adaptiveBudgetExecution', adaptiveReview],
    ['qualityDiversityReplicas', qdReview], ['sequentialExecution', context.sequentialReview]
  ];
  for (const [key, value] of entries) {
    if (value) result.comparativeAnalysis[key] = value;
  }
  result.comparativeAnalysis.crossExamination = crossExamination.summary(examined);
  result.comparativeAnalysis.claimGraph = graph;
  result.comparativeAnalysis.research = require('./trinityResearchRuntime').analyze({
    worlds: examined.reports, design: context.design || {}, graph
  });
  const contradictions = result.comparativeAnalysis.research.semanticReview.relations.filter(relation => relation.type === 'contradicts');
  if (contradictions.length && result.outcome === 'SYNTHESIZE_CLAIMS') {
    result.canMerge = false;
    result.outcome = 'KEEP_PARETO_SET';
    result.mergedEvidence = null;
    result.reason = 'typed_semantic_contradiction';
  }
}

function enforceRequiredVariantGates(context) {
  const { result } = context;
  const failures = [...requiredAdapterFailures(context), ...requiredPolicyFailures(context)];
  if (!failures.length) return result;
  return { ...result, canMerge: false, outcome: 'ESCALATE_EXPERIMENT', selectedWorld: null,
    mergedEvidence: null, reason: `required_variant_execution_incomplete:${failures.join(',')}` };
}

function requiredAdapterFailures(context) {
  const failures = [];
  const required = context.input.variantSelection?.requiredAdapters || [];
  const executions = context.variantExecution?.executions || {};
  collectAdapterFailures({ failures, required, executions });
  return failures;
}

function requiredPolicyFailures(context) {
  return [missingDiversity(context), missingPareto(context), missingTemporal(context),
    missingRecursive(context), missingAdaptive(context), missingQualityDiversity(context),
    missingJury(context), missingSequential(context), missingFactorial(context)].filter(Boolean);
}

function missingDiversity(context) {
  const selection = context.input.variantSelection || {};
  if (!['heterogeneous', 'provider_diverse'].includes(selection.experimentalDesign?.diversityPolicy)) return null;
  if (selection.experimentalDesign.diversityPolicy === 'heterogeneous' && selection.diversity?.passes !== true) return 'diversity_plan_incomplete';
  const observed = require('./trinityObservedDiversity').evaluate(context.worlds, selection);
  context.result.comparativeAnalysis.effectiveDiversity = observed;
  return observed.valid ? null : observed.reason;
}

function missingPareto(context) {
  return hasAdapter(context, 'pareto_objective_assigner') && !context.result.comparativeAnalysis?.pareto
    ? 'pareto_comparison_missing' : null;
}

function missingTemporal(context) {
  const design = context.input.variantSelection?.experimentalDesign || {};
  return temporalRequired(design) && context.temporalReview?.evidenceStatus !== 'verified'
    ? 'temporal_evidence_incomplete' : null;
}

function missingRecursive(context) {
  const design = context.input.variantSelection?.experimentalDesign || {};
  return recursiveRequired(design) && !recursiveComplete(context.recursiveReview)
    ? 'recursive_execution_incomplete' : null;
}

function recursiveComplete(review) {
  if (['verified', 'no_subproblem'].includes(review?.status)) return true;
  return review?.status === 'recursion_blocked'
    && ['max_depth_reached', 'budget_exhausted', 'marginal_cost_below_threshold', 'cycle_detected'].includes(review.reason);
}

function missingAdaptive(context) {
  const policy = context.input.variantSelection?.experimentalDesign?.replicationPolicy;
  return policy === 'adaptive_budget_fixed_replicas' && context.adaptiveReview?.status !== 'executed'
    ? 'adaptive_continuation_incomplete' : null;
}

function missingQualityDiversity(context) {
  const policy = context.input.variantSelection?.experimentalDesign?.replicationPolicy;
  return policy === 'quality_diversity_replicas' && context.qdReview?.status !== 'executed'
    ? 'qd_replica_execution_incomplete' : null;
}

function missingFactorial(context) {
  if (context.input.variantSelection?.experimentalDesign?.worldTopology !== 'factorial_grid') return null;
  const treatment = require('./trinityFactorialProvenance').evaluate(context.worlds,
    context.input.variantSelection.worldModelAssignments);
  context.result.comparativeAnalysis.factorialTreatment = treatment;
  return treatment.valid ? null : treatment.reason;
}

function missingSequential(context) {
  const required = context.input.variantSelection?.experimentalDesign?.replicationPolicy === 'adaptive_replica_count'
    || hasAdapter(context, 'sequential_design_scheduler');
  return required && context.sequentialReview?.status !== 'executed' ? 'sequential_execution_incomplete' : null;
}

function missingJury(context) {
  const design = context.input.variantSelection?.experimentalDesign || {};
  return juryRequired(design) && context.result.jury?.status !== 'advisory'
    ? 'jury_deliberation_incomplete' : null;
}

function hasAdapter(context, adapter) {
  return (context.input.variantSelection?.requiredAdapters || []).includes(adapter);
}

async function runQualityDiversityReview(context) {
  const { db, input, reports } = context;
  const selection = input.variantSelection || {};
  if (selection.experimentalDesign?.replicationPolicy !== 'quality_diversity_replicas') return null;
  const initial = variantRuntime.runQualityDiversity(reports);
  if (initial.status !== 'executed') return { status: 'incomplete', reason: initial.reason };
  const schedule = noveltyArchive.scheduleReplicas({ niches: qdTargets(initial, selection.qdConfig),
    replicaBudget: Number(selection.qdConfig?.replicaBudget) });
  try {
    return await adaptiveContinuation.runQualityDiversityReplicas({ db, reports,
      targets: schedule.replicas, selection, mission: input.mission,
      missionId: input.missionId, orchestratorId: input.orchestratorId,
      repoRoot: input.repoRoot, timeoutMs: 180000 });
  } catch (error) {
    return { status: 'incomplete', reason: error.code || 'qd_replica_dispatch_failed' };
  }
}

function qdTargets(initial, config = {}) {
  const occupied = new Set((initial.archive || []).map((item) => item.niche));
  const niches = [];
  const targetCount = Number(config.replicaBudget) || 0;
  for (let x = 0; niches.length < targetCount && x < 8; x += 1) {
    for (let y = 0; niches.length < targetCount && y < 8; y += 1) {
      const niche = `niche_${x}:${y}`;
      if (!occupied.has(niche)) niches.push(niche);
    }
  }
  return niches;
}

function collectAdapterFailures(context) {
  const { failures, required, executions } = context;
  const checks = [
    ['factorial_grid_executor', executions.factorial],
    ['counterfactual_fork_executor', executions.counterfactual],
    ['oracular_executor', executions.oracle], ['oracle_predictor', executions.oracle],
    ['exploratory_novelty_executor', executions.qualityDiversity],
    ['novelty_archive', executions.qualityDiversity], ['qd_replica_scheduler', executions.qualityDiversity],
    ['multi_objective_scalarizer', executions.scalarizedObjectives]
  ];
  for (const [adapter, execution] of checks) {
    if (required.includes(adapter) && execution?.status !== 'executed') failures.push(`${adapter}_incomplete`);
  }
}

function temporalRequired(design) {
  return ['short_medium_long', 'multi_horizon_grid'].includes(design.temporalPolicy)
    || design.worldTopology === 'temporal_horizons';
}

function recursiveRequired(design) {
  return design.worldTopology === 'recursive_nesting' || design.hypothesisPolicy === 'recursive_decomposition';
}

function juryRequired(design) {
  return design.adjudicationPolicy === 'blind_jury_advisory' || design.interactionPolicy === 'jury_deliberation';
}

async function runAdaptiveReview(context) {
  const { input, db, reports } = context;
  if (input.variantSelection?.experimentalDesign?.replicationPolicy !== 'adaptive_budget_fixed_replicas') return null;
  try {
    return await adaptiveContinuation.run({ db, reports, selection: input.variantSelection,
      orchestratorId: input.orchestratorId, missionId: input.missionId,
      mission: input.mission, repoRoot: input.repoRoot,
      timeoutMs: 180000, executionPolicy: input.variantSelection.workerExecutionPolicy });
  } catch (error) {
    return { status: 'incomplete', reason: error.code || 'adaptive_continuation_failed' };
  }
}

function enforceAdaptiveGate(result, review) {
  if (!review || review.status === 'executed') return result;
  return { ...result, canMerge: false, outcome: 'ESCALATE_EXPERIMENT', selectedWorld: null,
    mergedEvidence: null, reason: `adaptive_${review.status}:${review.reason || 'continuation_missing'}` };
}

async function runRecursiveReview(context) {
  const { input, db, worlds } = context;
  const selection = input.variantSelection || {};
  const design = selection.experimentalDesign || {};
  if (!recursiveDesignRequired(design)) return null;
  const parent = worlds.find((world) => world.report?.claims?.length || world.report?.uncertainties?.length);
  if (!parent) return { status: 'no_subproblem', result: null };
  try {
    return await recursiveExecutor.executeRecursiveTrinity(recursiveInput({ db, input, parent, selection }));
  } catch (error) {
    return { status: 'unavailable', reason: error.code || 'nested_dispatch_failed' };
  }
}

function recursiveInput(context) {
  const { db, input, parent, selection } = context;
  return {
      mission: input.mission, parentReport: { ...parent.report, worldNumber: parent.worldNumber },
      depth: Number(selection.recursiveState?.depth) || 0,
      spentBudget: Number(selection.recursiveState?.spentBudget) || 0,
      parentProblemIds: selection.recursiveState?.parentProblemIds || [],
      config: { maxDepth: 3, recursionBudget: 0.3, minMarginalCost: 0.05, requireChildPromotion: true,
        parentProblemIds: selection.recursiveState?.parentProblemIds || [] },
      runNestedTrinity: (child) => nestedMissionRunner.run({ db, parentAgentId: parent.agentId,
        mission: child.mission, repoRoot: input.repoRoot, timeoutMs: 180000,
        tokens: require('./trinityBudgetPolicy').recursiveReserve(selection, input.tokenBudget),
        executionPolicy: selection.workerExecutionPolicy, parentProblemIds: child.config.parentProblemIds,
        depth: child.depth, spentBudget: child.spentBudget })
    };
}

function recursiveDesignRequired(design) {
  return design.worldTopology === 'recursive_nesting' || design.hypothesisPolicy === 'recursive_decomposition';
}

function enforceRecursiveGate(result, review) {
  if (!review || recursiveComplete(review)) return result;
  return { ...result, canMerge: false, outcome: 'ESCALATE_EXPERIMENT', selectedWorld: null,
    mergedEvidence: null, reason: `recursive_${review.status}:${review.reason || 'incomplete_nested_evidence'}` };
}

function runTemporalReview(selection, worlds) {
  const design = selection?.experimentalDesign || {};
  if (!['short_medium_long', 'multi_horizon_grid'].includes(design.temporalPolicy)
    && design.worldTopology !== 'temporal_horizons') return null;
  const report = temporal.compareTemporalWorlds(worlds.map((world) => world.report || {}));
  return { ...report, decisionAuthority: 'none' };
}


module.exports = { compareMission, enforceRequiredVariantGates };
