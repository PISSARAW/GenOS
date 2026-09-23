'use strict';

// Procedural learning cycle — orchestrates the production loop:
//
//   outcome → prediction error → plasticity → consolidation → evolve
//
// This is the abstraction the E2E autonome test manually wired before.
// Now it is a single callable service so the runtime can drive the full
// loop without test-side orchestration.

const predictionError = require('./proceduralPredictionErrorService');
const plasticity = require('./proceduralPlasticityService');
const consolidation = require('./proceduralConsolidationService');

/**
 * Run one learning cycle:
 *   1. Compute prediction error from expected vs observed outcome
 *   2. Apply plasticity (LTD for negative surprise, LTP for positive)
 *   3. Check consolidation threshold — if reached, consolidate golden path
 *   4. If surprise exceeds mutation threshold, trigger evolution
 *
 * @param {object} params
 * @param {object} params.parent — the current procedural organism
 * @param {number} params.expectedReward — expected reward (0-1)
 * @param {number} params.observedReward — observed reward (0-1)
 * @param {object} params.synapse — synapse to update with plasticity
 * @param {object} params.episodes — recent episodes for consolidation
 * @param {object} params.options — policy, thresholds
 * @returns {object} cycle result with plasticity, consolidation, and evolution trigger
 */
function num(value, fallback) {
  if (value == null) return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function runLearningCycle({ expectedReward, observedReward, synapse, episodes, options = {} }) {
  const pe = predictionError.computePredictionError({ expectedReward, observedReward });
  const action = predictionError.peAction(pe, options.policy || {});
  return {
    predictionError: pe,
    action,
    plasticity: applyPlasticity(synapse, { action, metrics: { success: observedReward, evidence: num(options.evidence, 0.5), cost: num(options.cost, 0.2), safety: num(options.safety, 0.5) }, policy: options.policy }),
    consolidation: consolidateIfReady(episodes, options),
    shouldEvolve: action.triggerMutationSearch,
    surprise: {
      delta: pe.delta,
      isSurprising: action.isSurprising,
      triggerLTD: action.triggerLTD,
      triggerLTP: action.triggerLTP,
      triggerMutationSearch: action.triggerMutationSearch,
    },
    timestamp: new Date().toISOString(),
  };
}

async function observeOutcomeAndAdapt(db, parent, cycleInput) {
  const input = cycleInput || {};
  const cycle = runLearningCycle(input);
  if (!cycle.shouldEvolve) {
    return { evolved: false, cycle };
  }
  const runtime = require('./proceduralRuntimeService');
  const evolution = await runtime.runEvolutionCycle(db, parent, input.evolution || {});
  return { evolved: true, cycle, evolution };
}

function applyPlasticity(synapse, ctx) {
  if (!ctx.action.triggerLTD && !ctx.action.triggerLTP) return null;
  const ltd = ctx.action.triggerLTD;
  return ltd
    ? plasticity.applyLTD(synapse, ctx.metrics, ctx.policy || {})
    : plasticity.applyLTP(synapse, ctx.metrics, ctx.policy || {});
}

function consolidateIfReady(episodes, options) {
  if (!episodes || episodes.length < 2) return null;
  return consolidation.consolidatePath(options.policy || {}, episodes);
}

/**
 * Build episodes from execution outcomes for consolidation.
 */
function buildEpisodes(outcomes) {
  return outcomes.map((o, i) => ({
    id: `ep-${i}`,
    trajectory: o.trajectory || [],
    outcome: o.outcome || 'unknown',
    success: o.outcome === 'success',
    context: o.context || {},
    observedAt: o.observedAt || new Date().toISOString(),
    structuralNodes: o.structuralNodes || [],
  }));
}

module.exports = {
  runLearningCycle,
  observeOutcomeAndAdapt,
  buildEpisodes,
};
