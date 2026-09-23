'use strict';

/**
 * ResourceReservation : réservation explicite avant exécution.
 * Le planner ne sur-alloue plus : toute spawn exige une réservation.
 */

const { getMetabolic, setMetabolic } = require('./metabolicStateService');

const reservations = new Map();

function reserve(opts) {
  const o = opts || {};
  if (!o.scopeId || !o.requester) throw new Error('reserve requires scopeId+requester');
  const state = getMetabolic(o.scopeId);
  const want = Number(o.tokens) || 0;
  const free = (state.tokenBudget || 0) - reservedFor(o.scopeId);
  if (want > free) return { granted: false, reason: 'insufficient_free_budget', free, want };
  const id = `res_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  reservations.set(id, { id, scopeId: o.scopeId, requester: o.requester, tokens: want, at: new Date().toISOString() });
  return { granted: true, reservationId: id, free: free - want };
}

function release(opts) {
  const o = opts || {};
  reservations.delete(o.reservationId);
  return { released: true };
}

function reservedFor(scopeId) {
  let sum = 0;
  for (const r of reservations.values()) {
    if (r.scopeId === scopeId) sum += r.tokens;
  }
  return sum;
}

module.exports = { reserve, release, reservedFor };
