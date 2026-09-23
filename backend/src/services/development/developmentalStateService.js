'use strict';

/**
 * DevelopmentalState (G10) : l'agent n'est pas spawn directement fini.
 * DNA -> programme développemental -> niche -> épigénétique -> phénotype.
 */

const STAGES = ['PLURIPOTENT', 'PROGENITOR', 'DIFFERENTIATING', 'SPECIALIZED', 'PLASTIC', 'CONSOLIDATING', 'STABLE', 'SENESCENT'];

const store = new Map();

function defaultDevelopmental(agentId) {
  return {
    agentId: String(agentId),
    stage: 'PLURIPOTENT',
    potency: 1, specialization: 0,
    activeHoxProgram: null,
    epigeneticMarks: [],
    differentiationHistory: [],
    plasticity: 1, consolidation: 0,
    senescence: 0, niche: null,
    updatedAt: new Date().toISOString()
  };
}

function getDevelopmental(agentId) {
  if (!agentId) return null;
  return store.get(String(agentId)) || defaultDevelopmental(agentId);
}

function setDevelopmental(opts) {
  const o = opts || {};
  if (!o.agentId) throw new Error('setDevelopmental requires agentId');
  const prev = getDevelopmental(o.agentId);
  const next = { ...prev, ...(o.patch || {}), agentId: String(o.agentId), updatedAt: new Date().toISOString() };
  store.set(String(o.agentId), next);
  return next;
}

module.exports = { getDevelopmental, setDevelopmental, defaultDevelopmental, STAGES };
