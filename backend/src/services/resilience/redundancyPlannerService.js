'use strict';

/**
 * RedundancyPlanner : redondance adaptative (pas de triple copie partout).
 * normal -> none ; critical verifier -> warm spare ; orchestrator -> checkpoint+successor.
 */

function planRedundancy(opts) {
  const o = opts || {};
  const crit = o.criticality || 'normal';
  if (crit === 'mission_critical') return { level: 'checkpoint_successor', spares: 1 };
  if (crit === 'critical') return { level: 'warm_spare', spares: 1 };
  return { level: 'none', spares: 0 };
}

module.exports = { planRedundancy };
