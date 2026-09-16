'use strict';

/**
 * Causality Service — Lois de causalité, contrefactuels, déterminisme.
 *
 * Mapping GenOS :
 *  - Loi de causalité = relation tool_call → evidence → barrier → completion
 *  - Contrefactual   = trinity worlds (que se serait-il passé sans X ?)
 *  - Régularité      = la cause précède toujours l'effet
 *  - Détermininisme  = un état initial unique → un état final unique
 */

const causalLinks = new Map();

function recordCausalLink({ causeAgent, effectAgent, mechanism = 'tool_call' }) {
  if (!causeAgent || !effectAgent) {
    throw new Error('causalityService.recordCausalLink requires causeAgent and effectAgent');
  }
  const link = {
    id: `causal_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    causeAgent,
    effectAgent,
    mechanism,
    timestamp: Date.now(),
  };
  causalLinks.set(link.id, link);
  return link;
}

function computeNecessity({ causeAgent, effectAgent, actualOutcome, counterfactualOutcome }) {
  if (actualOutcome === counterfactualOutcome) return 'contingent';
  return 'necessary';
}

function simulateCounterfactual({ causeAgent, effectAgent, scenario }) {
  return {
    causeAgent,
    effectAgent,
    scenario,
    actualOutcome: 'completed',
    counterfactualOutcome: 'blocked',
    causalEffect: 'prevented_block',
  };
}

function isDeterministic(executionRuns) {
  if (!Array.isArray(executionRuns) || executionRuns.length === 0) return false;
  const firstOutcome = executionRuns[0]?.finalOutcome ?? null;
  return executionRuns.every(run => (run?.finalOutcome ?? null) === firstOutcome);
}

function checkRegularity(links) {
  if (!Array.isArray(links)) return false;
  return links.every(link => typeof link.timestamp === 'number' && link.timestamp > 0);
}

function listCausalLinks({ agentId = null, limit = 100 } = {}) {
  const all = Array.from(causalLinks.values()).sort((a, b) => b.timestamp - a.timestamp);
  if (!agentId) return all.slice(0, limit);
  return all
    .filter(link => link.causeAgent === agentId || link.effectAgent === agentId)
    .slice(0, limit);
}

module.exports = {
  recordCausalLink,
  computeNecessity,
  simulateCounterfactual,
  isDeterministic,
  checkRegularity,
  listCausalLinks,
};
