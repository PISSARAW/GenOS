'use strict';

/**
 * Compute Scheduler — ADR 0034 D19 v1 (ordonnanceur métabolique).
 *
 * Utilité computationnelle testable (ADR Phase 31) :
 *   U(a) = EIG(a) × Relevance(a) × Urgency(a) / (ComputeCost(a) + InterferenceCost(a))
 * Politique :
 *  - cheap sensing : toujours (coût ~0, jamais de gate) ;
 *  - incremental graph update : si cartographyPressure ≥ 0.3 ;
 *  - static checks : si wakeUrgency > 0 ;
 *  - LLM reasoning : seulement si U ≥ seuil ET budget de wakes restant ;
 *  - deep causal replay : si idle (faible urgence) ET haute valeur ;
 *  - memory consolidation : si activité DORMANT.
 * Pur et déterministe : aucun appel modèle, aucun accès disque.
 */

const LLM_UTILITY_THRESHOLD = 0.25;
const GRAPH_PRESSURE_FLOOR = 0.3;

function actionUtility(action) {
  const a = action || {};
  const gain = Number(a.expectedInfoGain) || 0;
  const relevance = Number(a.relevance) || 0;
  const urgency = Number(a.urgency) || 0;
  const cost = (Number(a.computeCost) || 0) + (Number(a.interferenceCost) || 0);
  if (cost <= 0) return gain * relevance * urgency > 0 ? Number.POSITIVE_INFINITY : 0;
  return (gain * relevance * urgency) / cost;
}

function llmAllowed(job) {
  const { pressures, budget } = job;
  const llm = (pressures && pressures.llmRequest) || {};
  if (actionUtility(llm) < LLM_UTILITY_THRESHOLD) return { allowed: false, reason: 'utility-below-threshold' };
  if ((budget && budget.wakesLeft || 0) <= 0) return { allowed: false, reason: 'wake-budget-exhausted' };
  if (pressures && pressures.deferReasoning === true) return { allowed: false, reason: 'machine-stressed-defer' };
  return { allowed: true, reason: 'utility-above-threshold' };
}

function planCycle(job) {
  if (!job || !job.pressures) return { planned: false, reason: 'pressures-required' };
  const plan = [{ action: 'cheap-sensing', gated: false, reason: 'always' }];
  appendPressureSteps(plan, job);
  appendIdleSteps(plan, job);
  return { planned: true, plan };
}

function appendPressureSteps(plan, job) {
  const pressures = job.pressures;
  if ((pressures.cartographyPressure || 0) >= GRAPH_PRESSURE_FLOOR) {
    plan.push({ action: 'incremental-graph-update', gated: false, reason: 'cartography-pressure' });
  }
  if ((pressures.wakeUrgency || 0) > 0) {
    plan.push({ action: 'static-checks', gated: false, reason: 'wake-urgency' });
  }
  const llm = llmAllowed({ pressures, budget: job.budget });
  plan.push({ action: 'llm-reasoning', gated: true, allowed: llm.allowed, reason: llm.reason });
}

function appendIdleSteps(plan, job) {
  const pressures = job.pressures;
  if ((pressures.wakeUrgency || 0) < 0.2 && (pressures.valueEstimate || 0) > 0.7) {
    plan.push({ action: 'deep-causal-replay', gated: true, allowed: true, reason: 'idle-high-value' });
  }
  if ((job.activity || 'DORMANT') === 'DORMANT') {
    plan.push({ action: 'memory-consolidation', gated: false, reason: 'sleep-cycle' });
  }
}

module.exports = {
  actionUtility,
  llmAllowed,
  planCycle,
  LLM_UTILITY_THRESHOLD,
  GRAPH_PRESSURE_FLOOR
};
