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

const { findFallbacks } = require('../capabilityEscalationService');
const { evaluateAllGates, transitionStatus } = require('./plasmidGateService');

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PLASMID_STATUS = Object.freeze({
  AVAILABLE: 'available',
  LEASED: 'leased',
  ASSIMILATED: 'assimilated',
  DISABLED: 'disabled',
  SUPERSEDED: 'superseded',
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

// ---------------------------------------------------------------------------
// Process-local capability manifest registry; durable agent bindings are stored separately.
// ---------------------------------------------------------------------------

const plasmidRegistry = new Map();
const assimilationLog = [];

// ---------------------------------------------------------------------------
// PlasmidManifest factory
// ---------------------------------------------------------------------------

const MANIFEST_DEFAULTS = {
  donor: null, capability: null, code: null, tools: [], requiredTools: [], requiredAuthority: null, evidence: [],
  provenance: null, compatibility: { topologies: [], roles: [] },
  risk: 0.5, recipient: null, status: PLASMID_STATUS.AVAILABLE, acquisitionCount: 0
};

function buildManifest(opts = {}) {
  const now = Date.now();
  return {
    ...MANIFEST_DEFAULTS,
    ...opts,
    id: opts.id || `plasmid_${Math.random().toString(36).slice(2, 10)}`,
    acquiredAt: now,
    requiredTools: opts.requiredTools || opts.tools || [],
    expiresAt: now + (Number.isFinite(opts.ttlMs) && opts.ttlMs > 0 ? opts.ttlMs : DEFAULT_TTL_MS),
    expressionStatus: EXPRESSION_STATUS.LATENT,
    assimilationCount: 0,
    successCount: 0,
    status: opts.status || PLASMID_STATUS.AVAILABLE
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
    result: () => ({ action: 'SATISFIED', reasoning: 'already_owned', step: 'OWNED' })
  },
  {
    step: 'LEASE',
    test: (c) => findLeaseCandidate(c.availablePlasmids, c.targetAgent),
    result: (c, hit) => ({ action: 'ASSIMILATE_PLASMID', plasmidId: hit.id, reasoning: 'lease_available', step: 'LEASE' })
  },
  {
    step: 'DELEGATE',
    test: (c) => c.helperAgent && hasCapability(c.helperAgent, c.requiredCapability),
    result: (c) => ({ action: 'DELEGATE', reasoning: 'delegate_to_helper', step: 'DELEGATE', delegateTo: c.helperAgent.id })
  },
  {
    step: 'PLASMID',
    test: (c) => findCompatiblePlasmid(c.availablePlasmids, c.targetAgent),
    result: (c, hit) => ({ action: 'ASSIMILATE_PLASMID', plasmidId: hit.id, reasoning: 'plasmid_available', step: 'PLASMID' })
  },
  {
    step: 'GENOME',
    test: (c) => c.specializedGenomes?.length > 0 && findMatchingGenome(c.specializedGenomes, c.requiredCapability),
    result: (c, hit) => ({ action: 'USE_GENOME', reasoning: 'genome_available', step: 'GENOME', genomeId: hit.id })
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
    p.capability && p.status === PLASMID_STATUS.AVAILABLE && isCompatible(p, targetAgent) && !isExpired(p)
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
  const { plasmidId, fromAgentId, toAgentId } = ctx;

  const plasmid = plasmidRegistry.get(plasmidId);
  if (!plasmid) throw new Error(`Plasmid not found: ${plasmidId}`);
  if (isExpired(plasmid)) throw new Error(`Plasmid expired: ${plasmidId}`);
  if (plasmid.status !== PLASMID_STATUS.AVAILABLE) throw new Error(`Plasmid is not available: ${plasmidId}`);
  if (!fromAgentId || !toAgentId) throw new Error('Donor and recipient are required.');
  const transition = transitionStatus(plasmidId, PLASMID_STATUS.LEASED, 'acquired');
  if (!transition.success) throw new Error(transition.error);

  plasmid.recipient = toAgentId;
  plasmid.donor = fromAgentId;
  plasmid.status = PLASMID_STATUS.LEASED;
  plasmid.expressionStatus = EXPRESSION_STATUS.LATENT;
  plasmid.acquisitionCount += 1;

  logEvent({ type: 'ACQUIRE', plasmidId, fromAgentId, toAgentId });
  return { ...plasmid };
}

function assimilatePlasmid(ctx) {
  if (!ctx || typeof ctx !== 'object') throw new Error('Invalid context');
  const { plasmidId, agentId, recipient } = ctx;

  const plasmid = plasmidRegistry.get(plasmidId);
  if (!plasmid) throw new Error(`Plasmid not found: ${plasmidId}`);
  if (isExpired(plasmid)) throw new Error(`Plasmid expired: ${plasmidId}`);
  assertRecipientLease(plasmid, agentId, recipient);
  assertPassingGates(plasmid, recipient);
  const transition = transitionStatus(plasmidId, PLASMID_STATUS.ASSIMILATED, 'gates_passed');
  if (!transition.success) throw new Error(transition.error);

  plasmid.recipient = agentId;
  plasmid.status = PLASMID_STATUS.ASSIMILATED;
  plasmid.expressionStatus = EXPRESSION_STATUS.EXPRESSED;
  plasmid.successCount += 1;

  plasmid.assimilationCount += 1;

  logEvent({ type: 'ASSIMILATE', plasmidId, agentId });
  return structuredClone(plasmid);
}

function assertRecipientLease(plasmid, agentId, recipient) {
  if (plasmid.status !== PLASMID_STATUS.LEASED || plasmid.recipient !== agentId) {
    throw new Error('Plasmid must be leased to this recipient before assimilation.');
  }
  if (!recipient || recipient.id !== agentId) throw new Error('Recipient profile is required for plasmid gates.');
}

function assertPassingGates(plasmid, recipient) {
  const gateResult = evaluateAllGates(plasmid, recipient);
  if (!gateResult.passed) throw new Error(`Plasmid assimilation gate failed: ${gateResult.reason}`);
}

function expirePlasmid(ctx) {
  if (!ctx || typeof ctx !== 'object') throw new Error('Invalid context');
  const { plasmidId, reason } = ctx;

  const plasmid = plasmidRegistry.get(plasmidId);
  if (!plasmid) throw new Error(`Plasmid not found: ${plasmidId}`);
  const transition = transitionStatus(plasmidId, PLASMID_STATUS.EXPIRED, reason || 'expired');
  if (!transition.success) throw new Error(transition.error);

  plasmid.status = PLASMID_STATUS.EXPIRED;
  plasmid.expressionStatus = EXPRESSION_STATUS.SILENCED;
  plasmid.expiresAt = Date.now();

  logEvent({ type: 'EXPIRE', plasmidId, reason });
  return structuredClone(plasmid);
}

function getPlasmidStatus(plasmidId) {
  if (!plasmidId) return null;
  const plasmid = plasmidRegistry.get(plasmidId);
  if (!plasmid) return null;
  return structuredClone(plasmid);
}

// ---------------------------------------------------------------------------
// Registry management
// ---------------------------------------------------------------------------

function registerPlasmid(manifest) {
  if (!manifest || !manifest.id || !manifest.capability || typeof manifest.code !== 'string' || !manifest.code.trim()) {
    throw new Error('Plasmid manifest requires an id, capability, and non-empty code.');
  }
  if (!Array.isArray(manifest.requiredTools) || !manifest.requiredAuthority) {
    throw new Error('Plasmid manifest requires requiredTools and requiredAuthority.');
  }
  if (plasmidRegistry.has(manifest.id)) throw new Error(`Plasmid already registered: ${manifest.id}`);
  plasmidRegistry.set(manifest.id, structuredClone(manifest));
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
  return Array.from(plasmidRegistry.values(), (plasmid) => structuredClone(plasmid));
}

function getAssimilationLog() {
  return assimilationLog.map((entry) => structuredClone(entry));
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
