'use strict';

/**
 * MetabolicState (G4) : économie de calcul unifiée.
 * Distingue budget (enveloppe) vs réservation (capacité engagée).
 */

const store = new Map();

function defaultMetabolic(scopeId) {
  return {
    scopeId: String(scopeId),
    tokenBudget: 0, monetaryBudget: 0, latencyBudget: 0,
    cpu: 1, gpu: 0, memory: 0, io: 0,
    contextWindow: 0, toolCalls: 0, workerSlots: 0, modelCapacity: 0,
    energyReserve: 1, burnRate: 0,
    pressure: 0, starvationRisk: 0,
    updatedAt: new Date().toISOString()
  };
}

function getMetabolic(scopeId) {
  if (!scopeId) return null;
  return store.get(String(scopeId)) || defaultMetabolic(scopeId);
}

function setMetabolic(opts) {
  const o = opts || {};
  if (!o.scopeId) throw new Error('setMetabolic requires scopeId');
  const prev = getMetabolic(o.scopeId);
  const next = { ...prev, ...o.patch, scopeId: String(o.scopeId), updatedAt: new Date().toISOString() };
  store.set(String(o.scopeId), next);
  return next;
}

function clearMetabolic(scopeId) {
  if (scopeId) store.delete(String(scopeId));
  else store.clear();
}

module.exports = { getMetabolic, setMetabolic, clearMetabolic, defaultMetabolic };
