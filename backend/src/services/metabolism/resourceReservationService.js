'use strict';

/**
 * ResourceReservation : réservation explicite avant exécution.
 * Le planner ne sur-alloue plus : toute spawn exige une réservation.
 */

const { getMetabolic } = require('./metabolicStateService');

const reservations = new Map();

// TTL par défaut : une réservation non consommée expire (pas de verrou fantôme).
const DEFAULT_RESERVATION_TTL_MS = 5 * 60 * 1000;

function purgeExpired(now) {
  const at = Number.isFinite(now) ? now : Date.now();
  for (const [id, r] of reservations) {
    if (r.expiresAt <= at) reservations.delete(id);
  }
}

function freeFor(scopeId) {
  const state = getMetabolic(scopeId);
  if (!state) return null;
  return (state.tokenBudget || 0) - reservedFor(scopeId);
}

function reservationTtlMs(opts) {
  const asked = Number(opts.ttlMs);
  return Number.isFinite(asked) && asked > 0 ? asked : DEFAULT_RESERVATION_TTL_MS;
}

function createReservation(o, free, ttlMs) {
  const id = `res_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const expiresAt = Date.now() + ttlMs;
  reservations.set(id, { id, scopeId: o.scopeId, requester: o.requester, tokens: Number(o.tokens) || 0, at: new Date().toISOString(), expiresAt });
  return { granted: true, reservationId: id, free: free - (Number(o.tokens) || 0), expiresAt };
}

function reserve(opts) {
  const o = opts || {};
  if (!o.scopeId || !o.requester) throw new Error('reserve requires scopeId+requester');
  purgeExpired(Date.now());
  const want = Number(o.tokens) || 0;
  if (want < 0) throw new Error('reserve requires tokens >= 0');
  const free = freeFor(o.scopeId);
  // Scope inconnu ou sans enveloppe : refus explicite, pas d'allocation fantôme.
  if (free === null) return { granted: false, reason: 'unknown_scope', free: 0, want };
  if (want > free) return { granted: false, reason: 'insufficient_free_budget', free, want };
  return createReservation(o, free, reservationTtlMs(o));
}

function release(opts) {
  const o = opts || {};
  // Release inconnu → false explicite (pas de succès fantôme).
  if (!o.reservationId || !reservations.has(o.reservationId)) return { released: false, reason: 'unknown_reservation' };
  reservations.delete(o.reservationId);
  return { released: true };
}

function reservedFor(scopeId) {
  purgeExpired(Date.now());
  let sum = 0;
  for (const r of reservations.values()) {
    if (r.scopeId === scopeId) sum += r.tokens;
  }
  return sum;
}

module.exports = { reserve, release, reservedFor, purgeExpired, DEFAULT_RESERVATION_TTL_MS };
