'use strict';
const metapopulationStore = require('../metapopulationStore');
const { createDaemonLease } = require('./persistentDaemonLeaseService');

const daemonStore = new Map();

async function registerResidentDaemon(context) {
  const { db, metapopulationId, demeId, daemonId, ownerId, ttlMs, options } = context;
  const now = Number(options?.now || Date.now());
  const lease = await createDaemonLease({ db, metapopulationId, demeId, ttlMs: ttlMs || 600000 });
  await metapopulationStore.attachDemeWorkspace(db, {
    metapopulationId,
    demeId,
    workspacePath: `/demes/${demeId}/workspace`,
    workspaceOwnerId: ownerId || daemonId,
    localBoundary: [],
    budget: { limits: { maintenance: ttlMs || 600000 }, used: {} },
  });
  daemonStore.set(demeId, {
    daemonId,
    ownerId: ownerId || daemonId,
    workspacePath: `/demes/${demeId}/workspace`,
    createdAt: now,
    expiresAt: new Date(lease.expiresAt).getTime(),
    leaseId: lease.leaseId,
    status: 'ACTIVE',
    heartbeatVersion: 1,
  });
  return { daemonId, demeId, workspacePath: `/demes/${demeId}/workspace`, leaseId: lease.leaseId, expiresAt: new Date(lease.expiresAt).getTime() };
}

async function maintainResidentDaemon(context) {
  const { db, metapopulationId, demeId, options } = context;
  const daemon = daemonStore.get(demeId);
  if (!daemon || daemon.status !== 'ACTIVE') {
    return { maintained: false, demeId, reason: daemon ? 'DAEMON_NOT_ACTIVE' : 'DAEMON_NOT_FOUND' };
  }
  const now = Number(options?.now || Date.now());
  if (now > daemon.expiresAt) {
    daemon.status = 'EXPIRED';
    return { maintained: false, demeId, reason: 'LEASE_EXPIRED' };
  }
  const fitness = options?.fitnessEvaluator?.(demeId) ?? 0.5;
  const lineage = { founders: [daemon.daemonId], generation: (daemon.lineageGeneration || 0) + 1 };
  await metapopulationStore.updateDemeProfile(db, {
    metapopulationId,
    demeId,
    changes: {
      fitness: { score: fitness, local: fitness },
      lineage: lineage,
      localMemoryRef: `memory:${demeId}:v${daemon.heartbeatVersion++}`,
    },
  });
  daemon.expiresAt = now + (options?.leaseTtlMs || 600000);
  return { maintained: true, demeId, fitness, lineage, expiresAt: daemon.expiresAt };
}

async function trackLongitudinalFitness(context) {
  const { db, metapopulationId, demeId, fitnessScore, options } = context;
  const history = [];
  const existing = await metapopulationStore.getDeme(db, metapopulationId, demeId);
  if (existing?.fitness) {
    history.push({ score: Number(existing.fitness?.score ?? existing.fitness?.local ?? 0), at: Number(existing.updatedAt) });
  }
  history.push({ score: fitnessScore, at: Number(options?.now || Date.now()) });
  if (history.length > 50) history.shift();
  await metapopulationStore.updateDemeProfile(db, {
    metapopulationId,
    demeId,
    changes: { fitness: { score: fitnessScore, local: fitnessScore, history } },
  });
  return { demeId, latest: fitnessScore, historyLength: history.length };
}

async function applyMemoryDecay(context) {
  const { db, metapopulationId, demeId, decayRate, options } = context;
  const deme = await metapopulationStore.getDeme(db, metapopulationId, demeId);
  if (!deme?.localMemoryRef) return { decayed: false, demeId };
  const age = Number(options?.now || Date.now()) - Number(deme.createdAt);
  const decayFactor = Math.max(0, 1 - decayRate * age / 86400000);
  const decayedRef = `memory:${demeId}:decayed-${decayFactor.toFixed(3)}`;
  if (decayedRef === deme.localMemoryRef) return { decayed: false, demeId, decayFactor };
  await metapopulationStore.updateDemeProfile(db, {
    metapopulationId,
    demeId,
    changes: { localMemoryRef: decayedRef },
  });
  return { decayed: true, demeId, decayFactor };
}

async function checkLineageContinuity(context) {
  const { db, metapopulationId, demeId } = context;
  const deme = await metapopulationStore.getDeme(db, metapopulationId, demeId);
  const lineage = deme?.lineage?.founders || [];
  return {
    demeId,
    continuous: lineage.length > 0,
    lineageFounders: lineage,
    generations: deme?.lineage?.generation || 0,
  };
}

async function consumeMaintenanceBudget(context) {
  const { db, metapopulationId, demeId, amount } = context;
  const result = await metapopulationStore.consumeDemeBudget(db, {
    metapopulationId,
    demeId,
    budgetKey: 'maintenance',
    amount,
  });
  return {
    demeId,
    used: Number(result.used?.maintenance || 0),
    limit: Number(result.limits?.maintenance || 0),
    remaining: Math.max(0, Number(result.limits?.maintenance || 0) - Number(result.used?.maintenance || 0)),
  };
}

module.exports = {
  registerResidentDaemon,
  maintainResidentDaemon,
  trackLongitudinalFitness,
  applyMemoryDecay,
  checkLineageContinuity,
  consumeMaintenanceBudget,
};
