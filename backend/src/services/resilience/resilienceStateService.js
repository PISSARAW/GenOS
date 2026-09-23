'use strict';

/**
 * ResilienceState : machine d'état HEALTHY -> DEGRADED -> CONTAINED ->
 * RECOVERING -> VERIFYING -> HEALTHY, avec DORMANT et TERMINAL/AUTOPSY/FOSSIL.
 */

const STATES = ['HEALTHY', 'DEGRADED', 'CONTAINED', 'RECOVERING', 'VERIFYING', 'DORMANT', 'TERMINAL', 'AUTOPSY', 'FOSSIL'];

const TRANSITIONS = {
  HEALTHY: ['DEGRADED', 'DORMANT'],
  DEGRADED: ['CONTAINED', 'RECOVERING', 'DORMANT'],
  CONTAINED: ['RECOVERING', 'DORMANT', 'TERMINAL'],
  RECOVERING: ['VERIFYING', 'DORMANT', 'TERMINAL'],
  VERIFYING: ['HEALTHY', 'DEGRADED', 'TERMINAL'],
  DORMANT: ['RECOVERING'],
  TERMINAL: ['AUTOPSY'],
  AUTOPSY: ['FOSSIL'],
  FOSSIL: []
};

const store = new Map();

function getResilience(agentId) {
  if (!agentId) return null;
  return store.get(String(agentId)) || { agentId: String(agentId), state: 'HEALTHY', at: new Date().toISOString(), history: [] };
}

function transition(opts) {
  const o = opts || {};
  const prev = getResilience(o.agentId);
  const next = o.to || 'DEGRADED';
  const allowed = TRANSITIONS[prev.state] || [];
  if (!allowed.includes(next)) return { ok: false, from: prev.state, to: next, reason: 'illegal_transition' };
  const state = { agentId: String(o.agentId), state: next, reason: o.reason || null, at: new Date().toISOString(), history: [...prev.history, { from: prev.state, to: next }] };
  store.set(String(o.agentId), state);
  return { ok: true, ...state };
}

module.exports = { getResilience, transition, STATES, TRANSITIONS };
