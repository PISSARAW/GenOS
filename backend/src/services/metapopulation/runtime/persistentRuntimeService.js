'use strict';
const metapopulationStore = require('../metapopulationStore');
const daemonLeases = require('./persistentDaemonLeaseService');
const { createHash, randomUUID } = require('crypto');

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
  // Initialize memory store for this daemon
  await initDaemonMemory(db, { metapopulationId, demeId, daemonId });
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
  // Store fitness per mission/cycle
  await recordMissionFitness(db, { metapopulationId, demeId, missionId: options?.missionId || 'default', cycle: options?.cycle || 0, fitnessScore: fitness, budgetLimit: daemon.ttlMs });
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
    changes: { fitness: { score: fitness, local: fitness }, lineage },
  });
}

async function initDaemonMemory(db, context) {
  const { metapopulationId, demeId, daemonId } = context;
  const memoryId = `mem-${demeId}-${Date.now()}-${randomUUID().slice(0, 8)}`;
  const initialContent = { daemonId, initializedAt: new Date().toISOString(), state: {} };
  const contentHash = hashContent(initialContent);
  await db.run(
    `INSERT INTO daemon_memory (memory_id, metapopulation_id, deme_id, content_hash, content_json, version, decay_factor, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 1, 1.0, ?, ?)`,
    memoryId, metapopulationId, demeId, contentHash, JSON.stringify(initialContent), new Date().toISOString(), new Date().toISOString()
  );
}

async function storeDaemonMemory(db, context) {
  const { metapopulationId, demeId, content, parentMemoryId } = context;
  const memoryId = `mem-${demeId}-${Date.now()}-${randomUUID().slice(0, 8)}`;
  const contentHash = hashContent(content);
  const version = parentMemoryId ? await getNextVersion(db, { metapopulationId, demeId, parentMemoryId }) : 1;
  await db.run(
    `INSERT INTO daemon_memory (memory_id, metapopulation_id, deme_id, content_hash, content_json, version, decay_factor, parent_memory_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 1.0, ?, ?, ?)`,
    memoryId, metapopulationId, demeId, contentHash, JSON.stringify(content), version, parentMemoryId || null, new Date().toISOString(), new Date().toISOString()
  );
  return { memoryId, version, contentHash };
}

async function getNextVersion(db, context) {
  const { metapopulationId, demeId, parentMemoryId } = context;
  const parent = await db.get(`SELECT version FROM daemon_memory
    WHERE metapopulation_id = ? AND deme_id = ? AND memory_id = ?`,
  metapopulationId, demeId, parentMemoryId);
  if (!parent) throw daemonError('METAPOPULATION_MEMORY_PARENT_MISSING');
  const row = await db.get(
    `SELECT MAX(version) as max_version FROM daemon_memory WHERE metapopulation_id = ? AND deme_id = ?`,
    metapopulationId, demeId
  );
  return (row?.max_version || 0) + 1;
}

function hashContent(content) {
  return createHash('sha256').update(JSON.stringify(content)).digest('hex');
}

async function applyMemoryDecay(context) {
  const { db, metapopulationId, demeId, decayRate, options } = context;
  const now = Number(options?.now || Date.now());
  // Get the latest memory for this deme
  const latestMemory = await db.get(
    `SELECT memory_id, content_json, decay_factor, version, updated_at FROM daemon_memory
     WHERE metapopulation_id = ? AND deme_id = ?
     ORDER BY version DESC LIMIT 1`,
    metapopulationId, demeId
  );
  if (!latestMemory) return { decayed: false, demeId, reason: 'NO_MEMORY' };

  const age = Math.max(0, now - new Date(latestMemory.updated_at).getTime());
  const decayFactor = Math.max(0, latestMemory.decay_factor - decayRate * age / 86400000);

  if (decayFactor >= latestMemory.decay_factor - 0.001) {
    return { decayed: false, demeId, decayFactor, reason: 'MINIMAL_DECAY' };
  }

  // Create new memory version with decayed content
  const content = JSON.parse(latestMemory.content_json);
  content.decayApplied = { factor: decayFactor, at: new Date().toISOString() };
  const newMemory = await storeDaemonMemory(db, { metapopulationId, demeId, content, parentMemoryId: latestMemory.memory_id });

  // Update deme's localMemoryRef to point to new version
  await metapopulationStore.updateDemeProfile(db, {
    metapopulationId, demeId,
    changes: { localMemoryRef: `memory:${demeId}:v${newMemory.version}` },
  });

  return { decayed: true, demeId, decayFactor, newMemoryId: newMemory.memoryId, version: newMemory.version };
}

async function recordMissionFitness(db, context) {
  const { metapopulationId, demeId, missionId, cycle, fitnessScore, budgetLimit } = context;
  const fitnessId = `fit-${demeId}-${missionId}-${cycle}-${Date.now()}`;
  await db.run(
    `INSERT INTO mission_fitness (fitness_id, metapopulation_id, deme_id, mission_id, cycle, fitness_score, budget_limit, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    fitnessId, metapopulationId, demeId, missionId, cycle, fitnessScore, budgetLimit, new Date().toISOString()
  );
}

async function getMissionFitnessHistory(db, context) {
  const { metapopulationId, demeId, missionId } = context;
  return db.all(
    `SELECT cycle, fitness_score, budget_used, budget_limit, created_at FROM mission_fitness
     WHERE metapopulation_id = ? AND deme_id = ? AND mission_id = ?
     ORDER BY cycle`,
    metapopulationId, demeId, missionId
  );
}

async function trackLongitudinalFitness(context) {
  const { db, metapopulationId, demeId, fitnessScore, options } = context;
  const existing = await metapopulationStore.getDeme(db, metapopulationId, demeId);
  if (!existing) throw daemonError('METAPOPULATION_DEME_NOT_FOUND');
  const history = Array.isArray(existing.fitness?.history) ? [...existing.fitness.history] : [];
  history.push({ score: fitnessScore, at: Number(options?.now || Date.now()) });
  if (history.length > 50) history.shift();
  await metapopulationStore.updateDemeProfile(db, {
    metapopulationId,
    demeId,
    changes: { fitness: { score: fitnessScore, local: fitnessScore, history } },
  });
  return { demeId, latest: fitnessScore, historyLength: history.length };
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

async function verifyRestoration(context) {
  const { db, metapopulationId, demeId } = context;
  const deme = await metapopulationStore.getDeme(db, metapopulationId, demeId);
  if (!deme) return { restored: false, reason: 'DEME_NOT_FOUND' };

  const lease = await daemonLeases.loadDaemonLease(db, metapopulationId, demeId);
  if (!lease || !lease.active) return { restored: false, reason: 'LEASE_NOT_ACTIVE' };

  if (lease.expiresAt < Date.now()) return { restored: false, reason: 'LEASE_EXPIRED' };

  if (deme.workspaceOwnerId !== lease.daemonId) {
    return { restored: false, reason: 'IDENTITY_MISMATCH', expectedDaemonId: deme.workspaceOwnerId, actualDaemonId: lease.daemonId };
  }

  // Check memory continuity
  const memoryCount = await db.get(
    `SELECT COUNT(*) as count FROM daemon_memory WHERE metapopulation_id = ? AND deme_id = ?`,
    metapopulationId, demeId
  );

  const fitnessHistory = await getMissionFitnessHistory(db, { metapopulationId, demeId, missionId: 'default' });

  return {
    restored: true,
    demeId,
    daemonId: lease.daemonId,
    leaseExpiresAt: lease.expiresAt,
    memoryVersions: memoryCount?.count || 0,
    fitnessCycles: fitnessHistory.length,
    latestFitness: fitnessHistory[fitnessHistory.length - 1]?.fitness_score || null,
  };
}

module.exports = {
  registerResidentDaemon,
  maintainResidentDaemon,
  trackLongitudinalFitness,
  applyMemoryDecay,
  checkLineageContinuity,
  consumeMaintenanceBudget,
  initDaemonMemory,
  storeDaemonMemory,
  recordMissionFitness,
  getMissionFitnessHistory,
  verifyRestoration,
};
