'use strict';

/**
 * ProceduralSymbiont (G14) : un organisme procédural devient un organe
 * comportemental vivant hébergé par un agent. Ne réimplémente pas le
 * runtime procédural : le référence et l'encapsule.
 */

const store = new Map();

function defaultSymbiont(hostId, organismId) {
  return {
    organismId: String(organismId),
    hostAgentId: String(hostId),
    niche: null, capabilities: [],
    inputContract: null, outputContract: null,
    authorityCeiling: null, currentFitness: 0,
    health: 'healthy', expressionState: 'expressed',
    lineage: null, evidenceProfile: null,
    attachedAt: new Date().toISOString()
  };
}

function attach(opts) {
  const o = opts || {};
  if (!o.hostAgentId || !o.organismId) throw new Error('attach requires hostAgentId+organismId');
  const sym = { ...defaultSymbiont(o.hostAgentId, o.organismId), niche: o.niche || null, capabilities: o.capabilities || [] };
  store.set(symKey(o), sym);
  return sym;
}

function symKey(o) {
  return `${o.hostAgentId}::${o.organismId}`;
}

function forHost(hostAgentId) {
  const out = [];
  for (const s of store.values()) {
    if (s.hostAgentId === String(hostAgentId)) out.push(s);
  }
  return out;
}

module.exports = { attach, forHost, defaultSymbiont };
