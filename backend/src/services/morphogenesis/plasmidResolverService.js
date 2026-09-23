'use strict';

/**
 * @file plasmidResolverService.js
 * @description PlasmidResolver — manages horizontal capability transfer
 * between agents through plasmids. Resolution order from cheapest to
 * most expensive:
 *   1. Already owned locally?
 *   2. Lease possible?
 *   3. Existing agent can help?
 *   4. Compatible plasmid available?
 *   5. Specialized genome exists?
 *   6. Spawn specialist?
 *   7. Cross/mutation/graft?
 *   8. Change topology/strategy?
 */

const { createPlasmid, assimilate } = require('../capabilityPlasmidService');
const { DECISION_TYPES, findFallbacks } = require('../capabilityEscalationService');

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PLASMID_STATUS = Object.freeze({
  AVAILABLE: 'available',
  LEASED: 'leased',
  ASSIMILATED: 'assimilated',
  EXPIRED: 'expired',
  REVOKED: 'revoked'
});

const EXPRESSION_STATUS = Object.freeze({
  LATENT: 'latent',
  EXPRESSED: 'expressed',
  SILENCED: 'silenced',
  REPLICATING: 'replicating'
});

const RESOLUTION_ORDER = Object.freeze([
  'OWNED',
  'LEASE',
  'DELEGATE',
  'PLASMID',
  'GENOME',
  'SPAWN',
  'EVOLVE',
  'TOPOLOGY'
]);

const DEFAULT_TTL_MS = 3600000; // 1 hour
const MAX_ASSIMILATION_COUNT = 10;

// ---------------------------------------------------------------------------
// In-memory plasmid registry (plugged into db in production)
// ---------------------------------------------------------------------------

const plasmidRegistry = new Map();
const assimilationLog = [];

// ---------------------------------------------------------------------------
// PlasmidManifest factory
// ---------------------------------------------------------------------------

const MANIFEST_DEFAULTS = {
  donor: null, capability: null, tools: [], evidence: [],
  provenance: null, compatibility: { topologies: [], roles: [] },
  risk: 0.5, recipient: null
};

function buildManifest(opts = {}) {
  const now = Date.now();
  return {
    ...MANIFEST_DEFAULTS,
    ...opts,
    id: opts.id || `plasmid_${Math.random().toString(36).slice(2, 10)}`,
    acquiredAt: now,
    expiresAt: now + (opts.ttlMs || DEFAULT_TTL_MS),
    expressionStatus: EXPRESSION_STATUS.LATENT,
    assimilationCount: 0,
    successCount: 0
  };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function isExpired(plasmid) {
  return plasmid.expiresAt && Date.now() > plasmid.expiresAt;
}

function isCompatible(plasmid, targetAgent) {
  const compat = plasmid.compatibility || {};
  const topoOk = !compat.topologies || compat.topologies.length === 0 ||
    (compat.topologies.includes(targetAgent?.topology));
  const roleOk = !compat.roles || compat.roles.length === 0 ||
    (compat.roles.includes(targetAgent?.role));
  return topoOk && roleOk;
}

function hasCapability(agent, capability) {
  return (agent?.capabilities || []).includes(capability);
}

function canLease(plasmid, targetAgent) {
  return plasmid.status === PLASMID_STATUS.AVAILABLE &&
    !isExpired(plasmid) &&
    isCompatible(plasmid, targetAgent);
}

function logEvent(entry) {
  assimilationLog.push({ ...entry, timestamp: new Date().toISOString() });
  if (assimilationLog.length > 1000) assimilationLog.shift();
}

// ---------------------------------------------------------------------------
// RESOLUTION LOGIC
// ---------------------------------------------------------------------------

const RESOLUTION_STEPS = [
  {
    step: 'OWNED',
    test: (c) => hasCapability(c.targetAgent, c.requiredCapability),
    result: () => ({ action: 'DENY', reasoning: 'already_owned', step: 'OWNED' })
  },
  {
    step: 'LEASE',
    test: (c) => findLeaseCandidate(c.availablePlasmids, c.targetAgent),
    result: (c, hit) => ({ action: 'ASSIMILATE_PLASMID', plasmidId: hit.id, reasoning: 'lease_available', step: 'LEASE' })
  },
  {
    step: 'DELEGATE',
    test: (c) => c.helperAgent && hasCapability(c.helperAgent, c.requiredCapability),
    result: (c) => ({ action: 'DENY', reasoning: 'delegate_to_helper', step: 'DELEGATE', delegateTo: c.helperAgent.id })
  },
  {
    step: 'PLASMID',
    test: (c) => findCompatiblePlasmid(c.availablePlasmids, c.targetAgent),
    result: (c, hit) => ({ action: 'ASSIMILATE_PLASMID', plasmidId: hit.id, reasoning: 'plasmid_available', step: 'PLASMID' })
  },
  {
    step: 'GENOME',
    test: (c) => c.specializedGenomes?.length > 0 && findMatchingGenome(c.specializedGenomes, c.requiredCapability),
    result: (c, hit) => ({ action: 'ASSIMILATE_PLASMID', plasmidId: null, reasoning: 'genome_available', step: 'GENOME', genomeId: hit.id })
  },
  {
    step: 'SPAWN',
    test: (c) => c.allowSpawn !== false,
    result: (c) => ({ action: 'SPAWN_SPECIALIST', reasoning: 'no_viable_path_spawn_specialist', step: 'SPAWN', capability: c.requiredCapability })
  },
  {
    step: 'EVOLVE',
    test: (c) => c.allowEvolution !== false,
    result: (c) => ({ action: 'EVOLVE_GENOTYPE', reasoning: 'evolve_for_capability', step: 'EVOLVE', capability: c.requiredCapability })
  }
];

function resolvePlasmid(ctx) {
  if (!ctx || typeof ctx !== 'object') throw new Error('Invalid context');
  if (!ctx.requiredCapability) return { action: 'DENY', reasoning: 'no_capability_specified' };

  for (const { test, result } of RESOLUTION_STEPS) {
    const hit = test(ctx);
    if (hit) return result(ctx, hit);
  }

  return {
    action: 'DENY',
    reasoning: 'no_viable_path',
    step: 'TOPOLOGY',
    fallbacks: findFallbacks(ctx.requiredCapability)
  };
}

function findLeaseCandidate(availablePlasmids, targetAgent) {
  if (!Array.isArray(availablePlasmids)) return null;
  return availablePlasmids.find(p => canLease(p, targetAgent) && !isExpired(p));
}

function findCompatiblePlasmid(availablePlasmids, targetAgent) {
  if (!Array.isArray(availablePlasmids)) return null;
  const candidates = availablePlasmids.filter(p =>
    p.capability && isCompatible(p, targetAgent) && !isExpired(p)
  );
  candidates.sort((a, b) => (a.risk || 0.5) - (b.risk || 0.5));
  return candidates[0] || null;
}

function findMatchingGenome(genomes, capability) {
  if (!Array.isArray(genomes)) return null;
  return genomes.find(g => g.capabilities && g.capabilities.includes(capability));
}

// ---------------------------------------------------------------------------
// ACQUIRE / ASSIMILATE / EXPIRE
// ---------------------------------------------------------------------------

function acquirePlasmid(ctx) {
  if (!ctx || typeof ctx !== 'object') throw new Error('Invalid context');
  const { plasmidId, fromAgentId, toAgentId, db } = ctx;

  const plasmid = plasmidRegistry.get(plasmidId);
  if (!plasmid) throw new Error(`Plasmid not found: ${plasmidId}`);
  if (isExpired(plasmid)) throw new Error(`Plasmid expired: ${plasmidId}`);

  plasmid.recipient = toAgentId;
  plasmid.donor = fromAgentId;
  plasmid.status = PLASMID_STATUS.LEASED;
  plasmid.expressionStatus = EXPRESSION_STATUS.REPLICATING;
  plasmid.assimilationCount += 1;

  logEvent({ type: 'ACQUIRE', plasmidId, fromAgentId, toAgentId });
  return { ...plasmid };
}

function assimilatePlasmid(ctx) {
  if (!ctx || typeof ctx !== 'object') throw new Error('Invalid context');
  const { plasmidId, agentId, db } = ctx;

  const plasmid = plasmidRegistry.get(plasmidId);
  if (!plasmid) throw new Error(`Plasmid not found: ${plasmidId}`);
  if (isExpired(plasmid)) throw new Error(`Plasmid expired: ${plasmidId}`);

  plasmid.recipient = agentId;
  plasmid.status = PLASMID_STATUS.ASSIMILATED;
  plasmid.expressionStatus = EXPRESSION_STATUS.EXPRESSED;
  plasmid.successCount += 1;

  if (plasmid.assimilationCount >= MAX_ASSIMILATION_COUNT) {
    plasmid.expressionStatus = EXPRESSION_STATUS.SILENCED;
  }

  logEvent({ type: 'ASSIMILATE', plasmidId, agentId });
  return { ...plasmid };
}

function expirePlasmid(ctx) {
  if (!ctx || typeof ctx !== 'object') throw new Error('Invalid context');
  const { plasmidId, reason } = ctx;

  const plasmid = plasmidRegistry.get(plasmidId);
  if (!plasmid) throw new Error(`Plasmid not found: ${plasmidId}`);

  plasmid.status = PLASMID_STATUS.EXPIRED;
  plasmid.expressionStatus = EXPRESSION_STATUS.SILENCED;
  plasmid.expiresAt = Date.now();

  logEvent({ type: 'EXPIRE', plasmidId, reason });
  return { ...plasmid };
}

function getPlasmidStatus(plasmidId) {
  if (!plasmidId) return null;
  const plasmid = plasmidRegistry.get(plasmidId);
  if (!plasmid) return null;
  return { ...plasmid };
}

// ---------------------------------------------------------------------------
// Registry management
// ---------------------------------------------------------------------------

function registerPlasmid(manifest) {
  if (!manifest || !manifest.id) throw new Error('Invalid plasmid manifest');
  plasmidRegistry.set(manifest.id, { ...manifest });
  return manifest.id;
}

function removePlasmid(plasmidId) {
  return plasmidRegistry.delete(plasmidId);
}

function clearRegistry() {
  plasmidRegistry.clear();
  assimilationLog.length = 0;
}

function getRegistry() {
  return Array.from(plasmidRegistry.values());
}

function getAssimilationLog() {
  return [...assimilationLog];
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

module.exports = {
  buildManifest,
  resolvePlasmid,
  acquirePlasmid,
  assimilatePlasmid,
  expirePlasmid,
  getPlasmidStatus,
  registerPlasmid,
  removePlasmid,
  clearRegistry,
  getRegistry,
  getAssimilationLog,
  PLASMID_STATUS,
  EXPRESSION_STATUS,
  RESOLUTION_ORDER
};
