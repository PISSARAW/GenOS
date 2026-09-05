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

// Registre plat : primitive string → handler async function
const HANDLERS = {
  // Lot 1 — Fondamentales
  snapshot: fundamentals.snapshot,
  cryptobiosis_freeze: fundamentals.snapshot,
  fork: fundamentals.fork,
  slm_route: fundamentals.slmRoute,
  provider_route: fundamentals.slmRoute,
  bisect_agent: fundamentals.bisectAgent,
  entropy_check: fundamentals.entropyCheck,
  evaluate: fundamentals.evaluate,
  verify: fundamentals.evaluate,
  vfs_dry_run: fundamentals.vfsDryRun,
  safe_revert: fundamentals.safeRevert,
  run: fundamentals.run,

  // Lot 2 — Mémoire
  compile_memory: memory.compileMemory,
  source_refs: memory.compileMemory,
  cherry_pick_golden_path: memory.cherryPickGoldenPath,
  cherry_pick_experience: memory.cherryPickGoldenPath,
  search_memory: memory.searchMemory,
  similarity_rank: memory.searchMemory,
  search_failures: memory.searchFailures,
  avoid_known_dead_ends: memory.searchFailures,
  stdp_update: memory.stdpUpdate,
  causal_weighting: memory.stdpUpdate,

  // Lot 3 — Évolution
  mutate: evolution.mutate,
  hypermutation: evolution.mutate,
  minimal_mutation: evolution.mutate,
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

  // Lot 4 — Sécurité & Résilience
  open: safety.circuitBreakerOpen,
  circuit_breaker: safety.circuitBreakerOpen,
  failure_window: safety.circuitBreakerOpen,
  half_open: safety.circuitBreakerHalfOpen,
  terminate: safety.apoptosis,
  apoptosis: safety.apoptosis,
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

  // Lot 5 — Collectif & Swarm Intelligence
  pheromone_deposit: collective.pheromoneDeposit,
  trail_selection: collective.trailSelection,
  evaporation: collective.trailSelection,
  brier_scores: collective.brierScores,
  quorum: collective.quorum,
  weighted_quorum: collective.weightedQuorum,

  // Lot 6 — Temporel & Causal
  causal_replay_intervention: temporal.causalReplay,
  causal_replay: temporal.causalReplay,
  mutated_universes: temporal.mutatedUniverses,
  alternative_future: temporal.mutatedUniverses,
  causal_rebase: temporal.causalRebase,
  inject_change: temporal.causalRebase,
  dependency_matrix: temporal.dependencyMatrix,
  lineage: temporal.provenance,
  provenance: temporal.provenance,
  blame: temporal.provenance,

  // Lot 7 — Recherche Profonde & Budget
  mcts_select: search.mctsSelect,
  expand: search.mctsSelect,
  prune: search.prune,
  retain_top_k: search.prune,
  reallocate: search.reallocate,
  resource_equalize: search.reallocate,
  token_limit: search.budgetLimit,
  time_limit: search.budgetLimit,
  iteration_limit: search.budgetLimit,
  prm_evaluate: search.prmEvaluate,
  score_partial_repro: search.prmEvaluate
};

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

    // Default : mock pour les primitives pas encore câblées
    return { success: true, message: 'Mocked primitive execution for ' + primitive };
  }

  async executePipeline(primitives, context = {}) {
    const results = [];
    let pipelineSuccess = true;
    for (const p of primitives) {
      const res = await this.executePrimitive(p, context);
      results.push({ primitive: p, result: res });

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
