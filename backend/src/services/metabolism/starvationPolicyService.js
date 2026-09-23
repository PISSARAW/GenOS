'use strict';

/**
 * StarvationPolicy : que faire quand une branche meurt de faim.
 * Jamais de création spontanée de ressources : dégrader, différer, geler.
 */

function policyFor(opts) {
  const o = opts || {};
  const risk = Number(o.starvationRisk) || 0;
  if (risk >= 0.8) return { action: 'cryptobiosis', priority: 'protect_critical_only' };
  if (risk >= 0.5) return { action: 'defer_low_utility', priority: 'keep_evidence_gates' };
  if (risk >= 0.25) return { action: 'grant_partial', priority: 'reduce_scope' };
  return { action: 'grant', priority: 'normal' };
}

module.exports = { policyFor };
