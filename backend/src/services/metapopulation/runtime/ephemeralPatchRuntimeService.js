'use strict';
const cryptobiosisSporeService = require('../../cryptobiosisSporeService');
const { randomUUID } = require('crypto');

const ephemeralDiscoverer = { discovered: new Map(), leaseStore: new Map() };

function discoverEphemeralPatch(patchDescriptor, leaseTtlMs = 300000) {
  const patchId = patchDescriptor.patchId || randomUUID();
  const leaseExpiresAt = Date.now() + leaseTtlMs;
  ephemeralDiscoverer.discovered.set(patchId, {
    patchId,
    environment: patchDescriptor.environment || {},
    leaseExpiresAt,
    discoveredAt: new Date().toISOString(),
    status: 'AVAILABLE',
  });
  ephemeralDiscoverer.leaseStore.set(patchId, { leaseExpiresAt, bound: false });
  return ephemeralDiscoverer.discovered.get(patchId);
}

function detectDisappearance(patchId, now) {
  const lease = ephemeralDiscoverer.leaseStore.get(patchId);
  if (!lease) return { disappeared: true, reason: 'NO_LEASE' };
  if (now > lease.leaseExpiresAt) {
    ephemeralDiscoverer.discovered.delete(patchId);
    ephemeralDiscoverer.leaseStore.delete(patchId);
    return { disappeared: true, reason: 'LEASE_EXPIRED' };
  }
  return { disappeared: false, remainingMs: lease.leaseExpiresAt - now };
}

async function sporeStateManager(patchId, demeState) {
  if (!demeState || demeState.status !== 'ACTIVE') return null;
  const spore = await cryptobiosisSporeService.createSpore({
    patchId,
    demeState: JSON.stringify(demeState),
    occurredAt: new Date().toISOString(),
  });
  return spore;
}

async function fastRebinder(patchId, options) {
  const lease = ephemeralDiscoverer.leaseStore.get(patchId);
  if (!lease || lease.bound) return { rebound: false, reason: 'ALREADY_BOUND_OR_MISSING' };
  lease.bound = true;
  return { rebound: true, patchId, boundAt: new Date().toISOString() };
}

function rebalanceCapacity(ephemeralPatches, occupiedPatches) {
  const available = ephemeralPatches.filter((p) => p.status === 'AVAILABLE');
  const occupied = ephemeralPatches.filter((p) => p.status === 'OCCUPIED');
  const deficit = occupied.length - available.length;
  return {
    availableCount: available.length,
    occupiedCount: occupied.length,
    deficit,
    rebalanceNeeded: deficit > 0,
    recommendedAction: deficit > 0 ? 'DISCOVER_MORE' : 'NONE',
  };
}

module.exports = { discoverEphemeralPatch, detectDisappearance, sporeStateManager, fastRebinder, rebalanceCapacity, ephemeralDiscoverer };
