/**
 * StrategyExecutionAdapter — Dispatcher principal des primitives de stratégie.
 *
 * Chaque lot de primitives est implémenté dans un handler dédié sous primitiveHandlers/.
 * Ce fichier reste un thin dispatcher + la boucle de rétroaction (feedback loop).
 */
const telemetry = require('./telemetryObserver');
const { getDatabase } = require('../db');

function getAdaptationService() {
  return require('./strategyAdaptationService');
}

// --- Handlers par lot ---
const fundamentals = require('./primitiveHandlers/fundamentals');
const memory = require('./primitiveHandlers/memory');
const evolution = require('./primitiveHandlers/evolution');
const safety = require('./primitiveHandlers/safety');
const collective = require('./primitiveHandlers/collective');
const temporal = require('./primitiveHandlers/temporal');
const search = require('./primitiveHandlers/search');
const computerUse = require('./primitiveHandlers/computerUse');
const resilience = require('./resilienceService');
const modelRouter = require('./modelRouter');
const advanced = require('./primitiveHandlers/strategyAdvanced');
const planning = require('./primitiveHandlers/strategyPlanning');

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

// Registre plat : primitive string → handler async function
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

  // Lot 8 — Computer Use (contrôle natif du PC : capture d'écran + plan d'actions)
  capture: computerUse.capture,
  screen_capture: computerUse.capture,
  run_plan: computerUse.runPlan,
  desktop_mission: computerUse.runPlan
};

/**
 * Log primitive execution for audit trail: records which primitives were actually
 * called during strategy execution, enabling post-mortem analysis and coherence
 * verification between contracted and executed primitives.
 */
async function logPrimitiveExecutionAudit(agentId, primitives = [], context = {}) {
  try {
    const db = await getDatabase();
    if (!db) return;
    const timestamp = new Date().toISOString();
    const executionKey = `audit_${agentId}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const details = {
      executionKey,
      agentId,
      primitives: primitives.map((p) => String(p).toLowerCase()),
      contextAgentId: context.agentId,
      contextOrchestrator: context.orchestratorId,
      timestamp
    };
    await db.run(
      `INSERT OR IGNORE INTO orchestration_action_receipts (receipt_key, orchestrator_id, source_event_id, tool, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      executionKey, context.orchestratorId || agentId, `exec_${Date.now()}`, `primitives: ${primitives.join(',')}`, 'completed', timestamp
    );
  } catch (err) {
    telemetry.emitEvent({
      eventType: 'STRATEGY_PRIMITIVE_AUDIT_FAILED',
      action: 'AUDIT_WRITE',
      detail: `Could not persist primitive execution audit: ${err.message}`,
      severity: 'warning',
      payload: { agentId, primitives, context }
    });
  }
}

class StrategyExecutionAdapter {
  constructor() {}

  async executePrimitive(primitive, context = {}) {
    telemetry.emitEvent({
      eventType: 'STRATEGY_PRIMITIVE_EXEC',
      action: primitive,
      severity: 'info',
      detail: 'Executing primitive ' + primitive,
      payload: context
    });

    const handler = HANDLERS[primitive];
    if (handler) {
      return handler(context);
    }

    const error = new Error(`Strategy primitive '${primitive}' has no registered handler.`);
    error.code = 'STRATEGY_PRIMITIVE_UNIMPLEMENTED';
    telemetry.emitEvent({
      eventType: 'STRATEGY_PRIMITIVE_UNIMPLEMENTED',
      action: primitive,
      severity: 'error',
      detail: error.message,
      payload: { primitive, agentId: context.agentId || null }
    });
    return { success: false, error: error.message, code: error.code };
  }

  async executePipeline(primitives, context = {}) {
    await logPrimitiveExecutionAudit(context.agentId, primitives, context);
    const results = [];
    let pipelineSuccess = true;
    for (const p of primitives) {
      const res = await this.executePrimitive(p, context);
      results.push({ primitive: p, result: res });

      if (res.success && p === 'brier_scores' && res.scores) {
        context.calibrationScores = { ...(context.calibrationScores || {}), ...res.scores };
      }

      if (!res.success) {
        pipelineSuccess = false;
        telemetry.emitEvent({
          eventType: 'STRATEGY_FEEDBACK_LOOP_TRIGGERED',
          action: 'ADAPT_STRATEGY',
          severity: 'warning',
          detail: 'Primitive ' + p + ' failed. Triggering strategy adaptation feedback loop.',
          payload: { primitive: p, result: res }
        });

        const targetId = context.orchestratorId || context.agentId;
        if (targetId) {
          try {
            const db = await getDatabase();
            const agent = await db.get('SELECT id, parent_agent_id, execution_mode FROM agents WHERE id = ?', targetId);
            const orchestratorId = (agent && agent.execution_mode === 'worker' && agent.parent_agent_id)
              ? agent.parent_agent_id
              : targetId;
            const adaptation = await getAdaptationService().changeStrategy(db, {
              orchestratorId,
              executionBudget: context.budget || null
            });
            results.push({
              primitive: 'adaptation_feedback',
              result: { success: true, adaptation }
            });
          } catch (adaptErr) {
            results.push({
              primitive: 'adaptation_feedback',
              result: { success: false, error: adaptErr.message }
            });
          }
        }
        break;
      }
    }
    return { success: pipelineSuccess, results };
  }

  async executePipelineWithFeedback(primitives, context = {}) {
    return this.executePipeline(primitives, context);
  }

  getHandlers() {
    return HANDLERS;
  }
}

module.exports = new StrategyExecutionAdapter();
