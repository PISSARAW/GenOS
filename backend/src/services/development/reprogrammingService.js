'use strict';

/**
 * Reprogramming (Yamanaka-like) : dédifférenciation contrôlée.
 * Préserve identité, provenance, mémoires importantes, lignée,
 * plafond d'autorité ; perd traits phénotypiques jetables.
 */

const { setDevelopmental } = require('./developmentalStateService');

function reprogram(opts) {
  const o = opts || {};
  if (!o.agentId) throw new Error('reprogram requires agentId');
  const preserved = {
    identity: o.identity || null,
    provenance: o.provenance || null,
    lineage: o.lineage || null,
    authorityCeiling: o.authorityCeiling || null
  };
  const state = setDevelopmental({
    agentId: o.agentId,
    patch: { stage: 'PLASTIC', potency: 0.8, specialization: 0.2, plasticity: 1, preserved }
  });
  return { ok: true, state, preserved, lostTraits: o.dropTraits || [] };
}

module.exports = { reprogram };
