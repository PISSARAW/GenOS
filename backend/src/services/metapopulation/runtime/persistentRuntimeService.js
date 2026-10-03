'use strict';
const metapopulationStore = require('../metapopulationStore');
const daemonLeases = require('./persistentDaemonLeaseService');

async function registerResidentDaemon(context) {
  const { db, metapopulationId, demeId, daemonId, ownerId, ttlMs } = context;
  const existing = await daemonLeases.loadDaemonLease(db, metapopulationId, demeId);
  if (existing) return resumeRegisteredDaemon({ db, existing, daemonId, ttlMs });
  const deme = await metapopulationStore.getDeme(db, metapopulationId, demeId);
  if (deme?.workspacePath) throw daemonError('METAPOPULATION_DAEMON_WORKSPACE_CONFLICT');
  await metapopulationStore.attachDemeWorkspace(db, {
    metapopulationId,
    demeId,
    workspacePath: `/demes/${demeId}/workspace`,
    workspaceOwnerId: ownerId || daemonId,
    localBoundary: [],
    budget: { limits: { maintenance: ttlMs || 600000 }, used: {} },
  });
  const lease = await daemonLeases.createDaemonLease({ db, metapopulationId, demeId, daemonId, ttlMs: ttlMs || 600000 });
  return { daemonId, demeId, workspacePath: `/demes/${demeId}/workspace`, leaseId: lease.leaseId, expiresAt: new Date(lease.expiresAt).getTime() };
}

async function resumeRegisteredDaemon(context) {
  const { db, existing, daemonId, ttlMs } = context;
  if (existing.daemonId !== daemonId) throw daemonError('METAPOPULATION_DAEMON_IDENTITY_CONFLICT');
  const lease = await daemonLeases.extendDaemonLease({ db, metapopulationId: existing.metapopulationId,
    demeId: existing.demeId, daemonId, ttlMs: ttlMs || existing.ttlMs || 600000 });
  return { daemonId, demeId: existing.demeId, workspacePath: `/demes/${existing.demeId}/workspace`,
    leaseId: lease.leaseId, expiresAt: lease.expiresAt };
}

function daemonError(code) {
  return Object.assign(new Error(code), { code });
}

async function maintainResidentDaemon(context) {
  const { db, metapopulationId, demeId, options } = context;
  const now = Number(options?.now || Date.now());
  const daemon = await daemonLeases.loadDaemonLease(db, metapopulationId, demeId);
  if (!daemon) return { maintained: false, demeId, reason: 'DAEMON_NOT_FOUND' };
  const deme = await metapopulationStore.getDeme(db, metapopulationId, demeId);
  if (!deme || deme.status !== 'ACTIVE') {
    return { maintained: false, demeId, reason: 'DEME_NOT_ACTIVE' };
  }
  if (now > daemon.expiresAt) {
    return { maintained: false, demeId, reason: 'LEASE_EXPIRED' };
  }
  const fitness = maintenanceFitness(options, demeId);
  const lineage = nextDaemonLineage(deme, daemon.daemonId);
  await persistDaemonHeartbeat(db, { metapopulationId, demeId, fitness, lineage });
  const renewed = await daemonLeases.extendDaemonLease({ db, metapopulationId, demeId,
    daemonId: daemon.daemonId, ttlMs: options?.leaseTtlMs || daemon.ttlMs || 600000 });
  return { maintained: true, demeId, fitness, lineage, expiresAt: renewed.expiresAt };
}

function maintenanceFitness(options, demeId) {
  return options?.fitnessEvaluator?.(demeId) ?? 0.5;
}

function nextDaemonLineage(deme, daemonId) {
  const founders = deme.lineage?.founders || [daemonId].filter(Boolean);
  return { ...deme.lineage, founders, generation: (deme.lineage?.generation || 0) + 1 };
}

async function persistDaemonHeartbeat(db, context) {
  const { metapopulationId, demeId, fitness, lineage } = context;
  await metapopulationStore.updateDemeProfile(db, {
    metapopulationId, demeId,
    changes: { fitness: { score: fitness, local: fitness }, lineage,
      localMemoryRef: `memory:${demeId}:v${lineage.generation}` },
  });
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
