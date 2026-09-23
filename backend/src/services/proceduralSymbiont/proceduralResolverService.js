'use strict';

/**
 * ProceduralResolver (G14) : comme le CapabilityResolver, mais pour
 * les organismes procéduraux. Autorité effective = intersection
 * (procédure ∩ host ∩ lease) — jamais d'amplification.
 */

function effectiveAuthority(opts) {
  const o = opts || {};
  const proc = new Set(o.procedure || []);
  const host = new Set(o.host || []);
  const lease = new Set(o.lease || []);
  const scope = lease.size > 0 ? lease : host;
  return [...proc].filter((c) => host.has(c) && scope.has(c));
}

function resolveProcedural(opts) {
  const o = opts || {};
  const cands = Array.isArray(o.candidates) ? o.candidates : [];
  const scored = cands.map((c) => scoreCandidate(c, o));
  scored.sort((a, b) => b.score - a.score);
  return { best: scored[0] || null, ranked: scored };
}

function scoreCandidate(c, o) {
  const fit = Number(c.fitness) || 0;
  const niche = c.niche === o.niche ? 0.3 : 0;
  const evidence = Number(c.evidence) || 0;
  const cost = Math.max(1, Number(c.cost) || 1);
  const auth = effectiveAuthority({ procedure: c.requires, host: o.hostAuthority, lease: o.lease });
  const blocked = (c.requires || []).length > 0 && auth.length === 0;
  return { ...c, score: blocked ? -1 : (fit + niche + evidence) / cost, effectiveAuthority: auth, blocked };
}

module.exports = { resolveProcedural, effectiveAuthority };
