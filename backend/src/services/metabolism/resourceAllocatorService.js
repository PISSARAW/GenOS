'use strict';

/**
 * ResourceAllocator (G5) : utilité multi-dimensionnelle.
 * Utility = EIG x Relevance x Urgency x Progress / Cost.
 * Verdicts : GRANT | GRANT_PARTIAL | DEFER | SUBSTITUTE | DENY.
 */

function num(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function utilityOf(req) {
  const r = req ?? {};
  const gain = num(r.expectedInformationGain, 0);
  const rel = num(r.relevance, 0.5);
  const urg = num(r.urgency, 0.5);
  const prog = num(r.expectedProgress, 0.5);
  const cost = Math.max(1, num(r.cost, 1));
  return (gain * rel * urg * prog) / cost;
}

function decide(opts) {
  const o = opts ?? {};
  const req = o.request ?? {};
  // Capacité négative = 0 (jamais de budget fantôme négatif).
  const free = Math.max(0, num(o.free, 0));
  const need = Math.max(0, num(req.tokens, 0));
  const u = utilityOf(req);
  if (need <= 0) return { verdict: 'DENY', utility: u, reason: 'no_cost_declared' };
  return decideSized({ need, free, utility: u, substitute: o.substitute });
}

function decideSized(s) {
  if (s.need <= s.free) return grantWhenUseful(s);
  return partialOrDefer(s);
}

function grantWhenUseful(s) {
  if (s.utility >= 0.05) return { verdict: 'GRANT', utility: s.utility, granted: s.need };
  return { verdict: 'DENY', utility: s.utility, reason: 'utility_too_low' };
}

function partialOrDefer(s) {
  if (s.free > 0) return partialIfWorthIt(s);
  return deferOrSubstitute(s);
}

function partialIfWorthIt(s) {
  if (s.utility >= 0.2) return { verdict: 'GRANT_PARTIAL', utility: s.utility, granted: s.free };
  return deferOrSubstitute(s);
}

function deferOrSubstitute(s) {
  if (s.utility >= 0.15) return { verdict: 'DEFER', utility: s.utility, reason: 'no_capacity_now' };
  if (s.substitute) return { verdict: 'SUBSTITUTE', utility: s.utility, substitute: s.substitute };
  return { verdict: 'DENY', utility: s.utility, reason: 'utility_too_low' };
}

module.exports = { utilityOf, decide };
