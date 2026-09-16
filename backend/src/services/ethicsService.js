'use strict';

/**
 * Ethics Service — Utilitarisme, Déontologie, Vertu.
 *
 * Mapping GenOS :
 *  - Utilitarisme   = budget_guardrail (maximiser l'efficience)
 *  - Déontologie    = tool_lease, evidence_barrier (règles)
 *  - Vertu          = agent_dna (caractère)
 */

function utilitarianRanking({ actions, utilityOf }) {
  if (!Array.isArray(actions) || typeof utilityOf !== 'function') {
    throw new Error('ethicsService.utilitarianRanking requires actions array and utilityOf function');
  }
  return actions
    .map(action => ({ action, utility: utilityOf(action) }))
    .sort((a, b) => b.utility - a.utility);
}

function deontologicalCheck({ action, rules }) {
  if (!action || !Array.isArray(rules)) {
    throw new Error('ethicsService.deontologicalCheck requires action and rules array');
  }
  return {
    action,
    rules,
    compliant: rules.every(rule => rule.satisfied !== false),
    violations: rules.filter(rule => rule.satisfied === false).map(rule => rule.name),
  };
}

function virtueEthicsAssessment({ agentId, virtues = {} }) {
  if (!agentId) {
    throw new Error('ethicsService.virtueEthicsAssessment requires agentId');
  }
  const defaultVirtues = {
    wisdom: 0,
    courage: 0,
    temperance: 0,
    justice: 0,
  };
  const merged = { ...defaultVirtues, ...virtues };
  const values = Object.values(merged);
  const mean = values.length > 0 ? values.reduce((sum, v) => sum + v, 0) / values.length : 0;
  return {
    agentId,
    virtues: merged,
    character: mean > 0.7 ? 'excellent' : mean > 0.4 ? 'good' : 'deficient',
    mean,
  };
}

module.exports = {
  utilitarianRanking,
  deontologicalCheck,
  virtueEthicsAssessment,
};
