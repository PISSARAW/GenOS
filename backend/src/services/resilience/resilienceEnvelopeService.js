'use strict';

/**
 * ResilienceEnvelope (G7) : politique de survie par agent/subgraph.
 * Médecine (soigner) != Résilience (continuer la mission malgré la panne).
 */

const store = new Map();

function defaultEnvelope(agentId) {
  return {
    agentId: String(agentId),
    failureDomain: 'worker',
    criticality: 'normal',
    checkpointPolicy: { every: 'milestone', keep: 3 },
    redundancyPolicy: 'none',
    retryPolicy: { max: 2, backoffMs: 1000 },
    degradedModes: ['reduced_model', 'narrower_scope', 'silent_network'],
    recoveryStrategies: ['retry', 'checkpoint_restore', 'successor'],
    cryptobiosisAllowed: true,
    apoptosisPolicy: 'evidence_gated',
    recoveryBudget: 5000,
    recoveryObjective: 'continue_mission_degraded'
  };
}

function getEnvelope(agentId) {
  if (!agentId) return null;
  return store.get(String(agentId)) || defaultEnvelope(agentId);
}

function setEnvelope(opts) {
  const o = opts || {};
  if (!o.agentId) throw new Error('setEnvelope requires agentId');
  const next = { ...defaultEnvelope(o.agentId), ...(o.envelope || {}) };
  store.set(String(o.agentId), next);
  return next;
}

module.exports = { getEnvelope, setEnvelope, defaultEnvelope };
