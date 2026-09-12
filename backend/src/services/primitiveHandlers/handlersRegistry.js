const fundamentals = require('./fundamentals');
const memory = require('./memory');
const evolution = require('./evolution');
const safety = require('./safety');
const collective = require('./collective');
const temporal = require('./temporal');
const search = require('./search');
const computerUse = require('./computerUse');
const resilience = require('../resilienceService');
const modelRouter = require('../modelRouter');
const advanced = require('./strategyAdvanced');
const planning = require('./strategyPlanning');
const optimization = require('./strategyOptimization');
const swarm = require('./strategySwarm');
const governance = require('./strategyGovernance');
const collectiveAdvanced = require('./strategyCollectiveAdvanced');
const remaining = require('./strategyRemaining');

async function snapshotTest(context = {}) {
  const snapshotResult = await fundamentals.snapshot(context);
  if (!snapshotResult.success) return snapshotResult;
  const verification = await fundamentals.verify(context);
  return { success: verification.success, snapshot: snapshotResult, verification };
}

async function autopsy(context = {}) {
  const report = await resilience.evaluateApoptosis(
    context.agentId || context.targetId || 'strategy_adapter',
    context.metrics || context.triggerMetrics || {},
    context.db || null,
    context.policy || {}
  );
  return { success: true, autopsy: report, apoptosisExecuted: report.apoptosisExecuted };
}

async function providerFallback(context = {}) {
  const models = Array.isArray(context.models)
    ? context.models.filter(Boolean)
    : [context.model, ...(Array.isArray(context.fallbacks) ? context.fallbacks : [])].filter(Boolean);
  if (!models.length) return { success: false, error: 'model and fallbacks are required.' };
  const result = await modelRouter.generate({
    ...context,
    model: models[0],
    policy: { primary: models[0], fallbacks: models.slice(1), mode: 'fallback' }
  });
  return { success: true, ...result };
}

const HANDLERS = {
  // Lot 1 — Fondamentales
  snapshot: fundamentals.snapshot,
  checkpoint: fundamentals.snapshot,
  production_snapshot: fundamentals.snapshot,
  last_good_snapshot: fundamentals.snapshot,
  snapshot_test: snapshotTest,
  cryptobiosis_freeze: fundamentals.cryptobiosisFreeze,
  freeze_spore: fundamentals.cryptobiosisFreeze,
  cryptobiosis_thaw: fundamentals.cryptobiosisThaw,
  rehydrate: fundamentals.cryptobiosisThaw,
  cryptobiosis: fundamentals.cryptobiosisFreeze,
  persist: fundamentals.cryptobiosisFreeze,
  vitrify: fundamentals.cryptobiosisFreeze,
  fork: fundamentals.fork,
  recursive_fork: fundamentals.recursiveFork,
  slm_route: fundamentals.slmRoute,
  provider_route: fundamentals.slmRoute,
  provider_fallback: providerFallback,
  fallback_chain: providerFallback,
  degraded_mode: providerFallback,
  independent_reports: advanced.independentReports,
  neutral_observer: advanced.neutralObserver,
  synthesis: advanced.synthesizeReports,
  security_coevolution: advanced.securityCoevolution,
  plan: planning.plan,
  role_forks: planning.roleForks,
  common_probes: planning.commonProbes,
  probe: planning.commonProbes,
  evidence: planning.evidence,
  conditional_mutation: planning.conditionalMutation,
  belief_update: planning.beliefUpdate,
  expected_information_gain: planning.expectedInformationGain,
  next_probe: planning.nextProbe,
  analyze_trajectory: planning.analyzeTrajectory,
  rank_states: optimization.rankStates,
  preserve_losers: optimization.preserveLosers,
  variance_analysis: optimization.varianceAnalysis,
  temperature_schedule: optimization.temperatureSchedule,
  resource_shift: optimization.resourceShift,
  separation: swarm.flocking,
  alignment: swarm.flocking,
  cohesion: swarm.flocking,
  weighted_barycenter: swarm.weightedBarycenter,
  path_conductivity: swarm.pathConductivity,
  role_gradient: swarm.roleGradient,
  energy_observe: swarm.energyObserve,
  elo: swarm.elo,
  uncertainty_gate: governance.uncertaintyGate,
  active_refusal: governance.activeRefusal,
  approval_request: governance.approvalRequest,
  drift_threshold: governance.driftThreshold,
  dead_letter_queue: governance.deadLetterQueue,
  alpha_beta_delta: collectiveAdvanced.greyWolf,
  position_update: collectiveAdvanced.positionUpdate,
  capability_route: collectiveAdvanced.capabilityRoute,
  knowledge_transfer: collectiveAdvanced.knowledgeTransfer,
  dynamic_assignment: collectiveAdvanced.dynamicAssignment,
  local_buffer: collectiveAdvanced.networkSilence,
  critical_or_success_flush: collectiveAdvanced.networkSilence,
  solver_tournament: collectiveAdvanced.solverTournament,
  frontier_escalation: remaining.frontierEscalation,
  impact_graph: remaining.impactGraph,
  invalidate_assumption: remaining.invalidateAssumption,
  paired_evaluation: remaining.pairedEvaluation,
  heredity_experiment: remaining.heredityExperiment,
  branch_evolution: remaining.branchEvolution,
  adversarial_review: remaining.adversarialReview,
  blind_critics: remaining.blindCritics,
  context_compaction: remaining.contextCompaction,
  experience_packets: remaining.experiencePackets,
  knowledge_graph: remaining.knowledgeGraph,
  reviewed_apply: remaining.reviewedApply,
  infer_traits: remaining.inferTraits,
  replicate: remaining.replicate,
  promote_trait: remaining.promoteTrait,
  phenotype_evidence: remaining.phenotypeEvidence,
  validate_child: remaining.validateChild,
  alternate_genome: remaining.alternateGenome,
  hot_spare: remaining.hotSpare,
  health_switch: remaining.healthSwitch,
  decoy_branch: remaining.decoyBranch,
  observe: remaining.observe,
  destroy_decoy: remaining.destroyDecoy,
  bisect_agent: fundamentals.bisectAgent,
  entropy_check: fundamentals.entropyCheck,
  shannon_entropy: fundamentals.entropyCheck,
  evaluate: fundamentals.evaluate,
  minimum_evaluation: fundamentals.evaluate,
  verify: fundamentals.verify,
  tests: fundamentals.verify,
  independent_verify: fundamentals.verify,
  vfs_dry_run: fundamentals.vfsDryRun,
  blast_radius: fundamentals.vfsDryRun,
  safe_revert: fundamentals.safeRevert,
  restore: fundamentals.safeRevert,
  run: fundamentals.run,
  worktree_cleanup: fundamentals.worktreeCleanup,
  cas_gc: fundamentals.casGc,
  dag_mark_sweep: fundamentals.dagMarkSweep,

  // Lot 2 — Mémoire
  record_experience: memory.recordExperience,
  recordExperience: memory.recordExperience,
  compile_memory: memory.compileMemory,
  compileMemory: memory.compileMemory,
  source_refs: memory.compileMemory,
  cherry_pick_golden_path: memory.cherryPickGoldenPath,
  cherry_pick_experience: memory.cherryPickGoldenPath,
  search_memory: memory.searchMemory,
  similarity_rank: memory.searchMemory,
  search_failures: memory.searchFailures,
  searchFailures: memory.searchFailures,
  avoid_known_dead_ends: memory.avoidKnownDeadEnds,
  avoidKnownDeadEnds: memory.avoidKnownDeadEnds,
  stdp_update: memory.stdpUpdate,
  synaptic_stdp_update: memory.stdpUpdate,
  stdp: memory.stdpUpdate,
  causal_weighting: memory.stdpUpdate,

  // Lot 3 — Évolution
  mutate: evolution.mutate,
  hypermutation: (ctx) => evolution.mutate({ ...ctx, hypermutation: true }),
  minimal_mutation: evolution.mutateSingle,
  single_mutation: evolution.mutateSingle,
  stagnation_check: evolution.stagnationCheck,
  breed: evolution.breed,
  select: evolution.select,
  select_winner: evolution.select,
  affinity_selection: evolution.select,
  pareto_select: evolution.paretoSelect,
  pareto_frontier: evolution.paretoSelect,
  pareto: evolution.paretoSelect,
  multi_objective_evaluation: evolution.paretoSelect,
  utopia_distance: evolution.paretoSelect,
  speciation: evolution.speciation,
  niche_preservation: evolution.speciation,
  plasmid_divergent_fork: evolution.plasmidDivergence,
  plasmid_divergence: evolution.plasmidDivergence,
  plasmid_optimization: evolution.plasmidDivergence,
  assimilate_plasmid: evolution.plasmidDivergence,

  // Lot 4 — Sécurité & Résilience
  open: safety.circuitBreakerOpen,
  circuit_breaker: safety.circuitBreakerOpen,
  failure_window: safety.circuitBreakerOpen,
  half_open: safety.circuitBreakerHalfOpen,
  terminate: safety.apoptosis,
  apoptosis: safety.apoptosis,
  autopsy,
  forensic_autopsy: autopsy,
  fossilize: safety.fossilize,
  fossil_record: safety.fossilize,
  fossil_list: safety.listFossils,
  quarantine: safety.quarantine,
  negative_selection: safety.quarantine,
  threat_memory: safety.quarantine,
  sandbox: safety.sandbox,
  isolated_run: safety.sandbox,
  permission_check: safety.permissionCheck,
  permissions: safety.permissionCheck,
  taint_tracking: safety.permissionCheck,
  execution_receipt: safety.permissionCheck,
  artifact_hash: safety.permissionCheck,
  artifact_gate: safety.permissionCheck,
  message_graph: safety.messageGraph,
  cycle_detection: safety.cycleDetection,
  diagnose: safety.diagnose,
  hypothesis_evidence: safety.hypothesisEvidence,
  belief_provenance: safety.beliefProvenance,
  beliefProvenance: safety.beliefProvenance,
  contradiction_check: safety.contradictionCheck,
  contradictionCheck: safety.contradictionCheck,
  belief_gate: safety.beliefGate,
  beliefGate: safety.beliefGate,
  conscience_evaluate: safety.conscienceEvaluate,
  dissonance_check: safety.conscienceEvaluate,
  conscience_eureka: safety.conscienceEureka,
  trigger_eureka: safety.conscienceEureka,

  // Lot 5 — Collectif & Swarm Intelligence
  pheromone_deposit: collective.pheromoneDeposit,
  trail_selection: collective.trailSelection,
  evaporation: collective.evaporation,
  brier_scores: collective.brierScores,
  quorum: collective.quorum,
  weighted_quorum: collective.weightedQuorum,

  // Lot 6 — Temporel & Causal
  causal_replay_intervention: temporal.causalReplay,
  intervene: temporal.causalReplay,
  causal_replay: temporal.causalReplay,
  replay: temporal.causalReplay,
  golden_path_replay: temporal.causalReplay,
  counterfactual_replay: temporal.causalReplay,
  mutated_universes: temporal.mutatedUniverses,
  alternative_future: temporal.mutatedUniverses,
  causal_rebase: temporal.causalRebase,
  inject_change: temporal.causalRebase,
  merge: temporal.causalMerge,
  causal_merge: temporal.causalMerge,
  dependency_matrix: temporal.dependencyMatrix,
  lineage: temporal.provenance,
  provenance: temporal.provenance,
  audit: temporal.provenance,
  preserve_provenance: temporal.provenance,
  preserveProvenance: temporal.provenance,
  blame: temporal.provenance,
  state_fold: temporal.stateFold,
  causal_diff: temporal.causalDiff,
  diff: temporal.causalDiff,
  replay_dependencies: temporal.replayDependencies,
  signature_match: temporal.signatureMatch,
  recursive_refinement: temporal.recursiveRefinement,
  future_worlds: temporal.futureWorlds,
  paired_execution: temporal.pairedExecution,
  similarity: temporal.similarity,
  equivalence_verdict: temporal.equivalenceVerdict,

  // Lot 7 — Recherche Profonde & Budget
  mcts_select: search.mctsSelect,
  beam_search: search.prune,
  budget_allocation: search.reallocate,
  expand: search.mctsSelect,
  schizogony: search.schizogonyBurst,
  schizogony_burst: search.schizogonyBurst,
  schizont_burst: search.schizogonyBurst,
  speculative_fanout: search.schizogonyBurst,
  prune: search.prune,
  retain_top_k: search.prune,
  prune_and_scale: search.pruneAndScale,
  route_pruning: search.routePruning,
  reallocate: search.reallocate,
  resource_equalize: search.reallocate,
  token_limit: search.budgetLimit,
  time_limit: search.budgetLimit,
  iteration_limit: search.budgetLimit,
  uncertainty_limit: search.budgetLimit,
  prm_evaluate: search.prmEvaluate,
  score_partial_repro: search.prmEvaluate,
  backpropagate: search.backpropagate,
  back_propagate: search.backpropagate,

  // Lot 8 — Computer Use
  capture: computerUse.capture,
  screen_capture: computerUse.capture,
  run_plan: computerUse.runPlan,
  desktop_mission: computerUse.runPlan,

  // Lot 9 — Browser Scout
  browser_navigate: async (ctx = {}) => {
    const { defaultBrowserScout } = require('../browserScoutService');
    const sessionId = ctx.sessionId || ctx.session_id || 'scout-main';
    return await defaultBrowserScout.navigate(sessionId, ctx.url, { htmlContent: ctx.htmlContent || ctx.html });
  },
  browser_act: async (ctx = {}) => {
    const { defaultBrowserScout } = require('../browserScoutService');
    const sessionId = ctx.sessionId || ctx.session_id || 'scout-main';
    return await defaultBrowserScout.act(sessionId, ctx);
  },
  browser_snapshot: async (ctx = {}) => {
    const { defaultBrowserScout } = require('../browserScoutService');
    const sessionId = ctx.sessionId || ctx.session_id || 'scout-main';
    return { success: true, snapshot: defaultBrowserScout.snapshotSession(sessionId) };
  }
};

module.exports = {
  HANDLERS,
  snapshotTest,
  autopsy,
  providerFallback
};
