'use strict';

function createExosome(payload = {}) {
  return {
    id: payload.id || `exo-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    sourceAgentId: payload.sourceAgentId || null,
    recipientAgentId: payload.recipientAgentId || null,
    capability: payload.capability || null,
    evidenceRefs: Array.isArray(payload.evidenceRefs) ? payload.evidenceRefs : [],
    signal: payload.signal || null,
    expiresAt: payload.ttlMs ? Date.now() + Number(payload.ttlMs) : null
  };
}

function isEligible(exosome, agent = {}, now = Date.now()) {
  if (!exosome || (exosome.expiresAt && exosome.expiresAt <= now)) return false;
  if (exosome.recipientAgentId && exosome.recipientAgentId !== agent.id) return false;
  if (exosome.capability && !(agent.capabilities || []).includes(exosome.capability)) return false;
  return true;
}

function uptake(exosomes, agent, now = Date.now()) {
  return (Array.isArray(exosomes) ? exosomes : []).filter((exosome) => isEligible(exosome, agent, now));
}

module.exports = { createExosome, isEligible, uptake };
