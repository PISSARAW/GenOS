'use strict';

/**
 * @file biomeCoordinationService.js
 * @description Biome coordination: an operating environment of specialized
 * populations. Wires ecological resource allocation, optimal foraging and the
 * swarm diversity metric instead of leaving them as prompt-only mechanisms.
 */
const biologicalModeService = require('./biologicalModeService');
const topologyCapabilityService = require('./topologyCapabilityService');
const swarmMetricsService = require('./swarmMetricsService');
const { defaultForaging } = require('./foragingScoutHarvesterService');
const biofilmMatrix = require('./biofilmMatrixService');
const topologySessionStore = require('./topologySessionStore');

const DEFAULT_ORGANIZATION = 'energy_huddle';
const MECHANISMS = ['resource_allocation', 'optimal_foraging', 'quorum_sensing'];
const sessions = new Map();

function serialize(session) {
  return {
    mission: session.mission,
    organization: session.organization,
    mechanisms: session.mechanisms,
    capabilityContract: session.capabilityContract,
    members: session.members,
    finalization: session.finalization || null,
    matrix: {
      matrixId: session.matrix.matrixId,
      version: session.matrix.version,
      maxEntries: session.matrix.maxEntries,
      entries: [...session.matrix.entries.entries()],
      history: session.matrix.history
    }
  };
}

function rehydrate(record) {
  const state = record.state || {};
  const matrix = biofilmMatrix.createMatrix(state.matrix?.matrixId || record.id, { maxEntries: state.matrix?.maxEntries });
  matrix.version = Number(state.matrix?.version) || 0;
  for (const [key, entry] of state.matrix?.entries || []) matrix.entries.set(key, entry);
  matrix.history = Array.isArray(state.matrix?.history) ? state.matrix.history : [];
  return { sessionId: record.id, ...state, matrix, persistVersion: record.storeVersion };
}

async function persist(session, db) {
  if (!db) return;
  await topologySessionStore.save(db, { id: session.sessionId, topology: 'biome', state: serialize(session), expectedVersion: session.persistVersion || 0 });
  session.persistVersion = (session.persistVersion || 0) + 1;
}

async function composeBiome(mission, options = {}) {
  const goal = String(mission || '').trim();
  if (!goal) {
    throw Object.assign(new Error('Biome mission is required.'), { code: 'BIOME_MISSION_REQUIRED' });
  }
  const organization = options.organization || DEFAULT_ORGANIZATION;
  const session = {
    sessionId: `biome-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    persistVersion: 0,
    mode: 'biome',
    mission: goal,
    organization,
    mechanisms: MECHANISMS,
    capabilityContract: topologyCapabilityService.contractFor({ mode: 'biome', organization }),
    matrix: biofilmMatrix.createMatrix(`biome-${Date.now()}`, options),
    members: biologicalModeService.compose('biome', goal)
  };
  sessions.set(session.sessionId, session);
  await persist(session, options.db);
  return session;
}

async function getSession(sessionId, db) {
  if (db) {
    const record = await topologySessionStore.load(db, sessionId);
    if (record && record.topology === 'biome') {
      const session = rehydrate(record);
      sessions.set(sessionId, session);
      return session;
    }
  }
  const session = sessions.get(sessionId);
  if (session) return session;
  throw Object.assign(new Error(`Unknown biome session '${sessionId}'.`), { code: 'BIOME_SESSION_UNKNOWN' });
}

async function sessionSnapshot(sessionId, options = {}) {
  const session = await getSession(sessionId, options.db);
  return { sessionId, mode: 'biome', version: session.matrix.version, entries: biofilmMatrix.read(session.matrix) };
}

async function allocateSessionResources(sessionId, populations, options = {}) {
  const session = await getSession(sessionId, options.db);
  const result = allocateResources(populations, options);
  for (const allocation of result.allocations) {
    biofilmMatrix.deposit(session.matrix, { key: `resource:${allocation.id}`, kind: 'resource_allocation', ...allocation });
  }
  await persist(session, options.db);
  return { sessionId, ...result, matrixVersion: session.matrix.version };
}

async function forageSession(sessionId, patchHistory, options = {}) {
  const session = await getSession(sessionId, options.db);
  const result = forageStep(patchHistory, options);
  biofilmMatrix.deposit(session.matrix, { key: `forage:${session.matrix.version + 1}`, kind: 'foraging_observation', ...result });
  await persist(session, options.db);
  return { sessionId, ...result, matrixVersion: session.matrix.version };
}

async function assessSessionHealth(sessionId, observations, options = {}) {
  const session = await getSession(sessionId, options.db);
  const result = ecosystemHealth(observations);
  biofilmMatrix.deposit(session.matrix, { key: `health:${session.matrix.version + 1}`, kind: 'ecosystem_health', ...result });
  await persist(session, options.db);
  return { sessionId, ...result, matrixVersion: session.matrix.version };
}

async function recordObservationDecisions(sessionId, observations, options = {}) {
  const session = await getSession(sessionId, options.db);
  for (const entry of [...(observations.exploitable || []), ...(observations.rejected || []), ...(observations.absent || [])]) {
    biofilmMatrix.deposit(session.matrix, { key: `observation:${entry.role}`, kind: 'patch_observation_decision', ...entry });
  }
  await persist(session, options.db);
  return { sessionId, matrixVersion: session.matrix.version };
}

async function finalizeBiomeSession(sessionId, dossiers, options = {}) {
  let session = await getSession(sessionId, options.db);
  if (session.finalization) return session.finalization;
  const populations = session.members.map((member) => ({ id: member.role, demand: 1, priority: 1 }));
  const allocation = await allocateSessionResources(sessionId, populations, {
    db: options.db,
    totalBudget: options.totalBudget === undefined ? populations.length * 1000 : options.totalBudget,
    minimumPerPopulation: options.minimumPerPopulation || 0
  });
  const observations = classifyDossiers(session.members, dossiers);
  await recordObservationDecisions(sessionId, observations, { db: options.db });
  const foraging = await forageSession(sessionId, observations.patchHistory, { db: options.db, iteration: 1, elapsedTimeSec: Math.max(1, observations.patchHistory.length), random: () => 0.5 });
  const health = await assessSessionHealth(sessionId, observations.exploitable.map((item) => ({ label: item.role })), { db: options.db });
  const quorumRatio = Number.isFinite(options.quorumRatio) ? options.quorumRatio : 0.5;
  if (quorumRatio < 0 || quorumRatio > 1) throw Object.assign(new Error('Biome quorum ratio must be between zero and one.'), { code: 'BIOME_QUORUM_INVALID' });
  const quorum = {
    reached: observations.exploitable.length >= 2 && observations.exploitable.length / session.members.length >= quorumRatio,
    support: Number((observations.exploitable.length / Math.max(1, session.members.length)).toFixed(3)),
    quorumRatio,
    population: session.members.length,
    acceptedDossiers: observations.exploitable.length
  };
  const decision = allocation.conserved && quorum.reached && health.verdict === 'resilient' ? 'completed' : 'blocked';
  const result = {
    sessionId,
    mode: 'biome',
    decision,
    reason: decision === 'completed' ? 'budget_conserved_quorum_and_health_acceptable' : 'budget_quorum_or_health_gate_failed',
    allocation,
    observations,
    foraging,
    health,
    quorum,
    matrixVersion: health.matrixVersion
  };
  session = await getSession(sessionId, options.db);
  session.finalization = result;
  await persist(session, options.db);
  return result;
}

function classifyDossiers(members, dossiers) {
  const byRole = new Map((Array.isArray(dossiers) ? dossiers : []).map((dossier) => [dossier.role, dossier.report]));
  const patchHistory = [];
  const accepted = [];
  const rejected = [];
  const absent = [];
  for (const member of members) {
    const report = byRole.get(member.role);
    if (!report) { absent.push({ role: member.role, status: 'absent' }); continue; }
    const claims = Array.isArray(report.claims) ? report.claims : [];
    const facts = claims.flatMap((claim) => Array.isArray(claim?.evidence) ? claim.evidence : []).filter(Boolean);
    if (!facts.length) { rejected.push({ role: member.role, status: 'rejected', reason: 'no_exploitable_evidence' }); continue; }
    accepted.push({ role: member.role, status: 'exploitable', evidenceCount: facts.length });
    patchHistory.push(...facts.map((fact) => ({ infoGain: 1, sourceRole: member.role, fact: String(fact).slice(0, 500) })));
  }
  return { patchHistory, exploitable: accepted, rejected, absent };
}

function allocateResources(populations, options = {}) {
  const list = Array.isArray(populations) ? populations : [];
  const totalBudget = options.totalBudget === undefined ? list.length * 1000 : options.totalBudget;
  const floor = options.minimumPerPopulation === undefined ? 0 : options.minimumPerPopulation;
  validateBudget(totalBudget, floor, list.length);
  const weights = populationWeights(list);
  return distributeBudget(weights, totalBudget, floor);
}

function validateBudget(totalBudget, floor, populationCount) {
  if (!Number.isSafeInteger(totalBudget) || totalBudget < 0) throw allocationError('totalBudget must be a non-negative safe integer.');
  if (!Number.isSafeInteger(floor) || floor < 0) throw allocationError('minimumPerPopulation must be a non-negative safe integer.');
  if (floor * populationCount > totalBudget) throw allocationError('Population minimums exceed the available budget.');
  if (totalBudget > 0 && populationCount === 0) throw allocationError('At least one population is required for a non-zero budget.');
}

function populationWeights(list) {
  const ids = new Set();
  return list.map((population, index) => {
    const id = String(population?.id || `population_${index + 1}`).trim();
    const demand = population?.demand;
    const priority = population?.priority;
    if (!id || ids.has(id)) throw allocationError(`Population id is empty or duplicated: '${id}'.`);
    if (!Number.isFinite(demand) || demand < 0) throw allocationError(`Population '${id}' has an invalid demand.`);
    if (!Number.isFinite(priority) || priority < 0) throw allocationError(`Population '${id}' has an invalid priority.`);
    ids.add(id);
    return { id, weight: demand * priority };
  });
}

function distributeBudget(weights, totalBudget, floor) {
  const weightSum = weights.reduce((sum, entry) => sum + entry.weight, 0);
  if (weights.length && (!Number.isFinite(weightSum) || weightSum <= 0)) throw allocationError('Population demand and priority must produce a positive finite weight.');
  const distributable = totalBudget - floor * weights.length;
  const exact = weights.map((entry) => distributable * entry.weight / weightSum);
  const base = exact.map((share) => Math.floor(share));
  let remaining = distributable - base.reduce((sum, value) => sum + value, 0);
  const order = exact.map((share, index) => ({ index, remainder: share - base[index], id: weights[index].id }))
    .sort((left, right) => right.remainder - left.remainder || left.id.localeCompare(right.id));
  for (let index = 0; index < remaining; index += 1) base[order[index].index] += 1;
  const allocations = weights.map((entry, index) => ({ id: entry.id, budget: floor + base[index] }));
  return { totalBudget, floor, allocations, conserved: allocations.reduce((sum, entry) => sum + entry.budget, 0) === totalBudget };
}

function allocationError(message) { return Object.assign(new Error(message), { code: 'BIOME_ALLOCATION_INVALID' }); }

function forageStep(patchHistory, options = {}) {
  const iteration = Number.isFinite(options.iteration) ? options.iteration : 1;
  const elapsedTimeSec = Number.isFinite(options.elapsedTimeSec) ? options.elapsedTimeSec : 1;
  return {
    patchYield: defaultForaging.evaluatePatchYield(Array.isArray(patchHistory) ? patchHistory : [], elapsedTimeSec),
    levyStep: defaultForaging.computeLevyFlightStep(iteration, options.random)
  };
}

function ecosystemHealth(observations) {
  const labels = (Array.isArray(observations) ? observations : []).map((observation) => (typeof observation === 'string' ? observation : observation?.label)).filter(Boolean);
  if (!labels.length) return { entropy: null, verdict: 'unknown' };
  const entropy = swarmMetricsService.calculateShannonEntropy(labels);
  return { entropy, verdict: entropy.normalizedEntropy >= 0.5 ? 'resilient' : 'fragile' };
}

module.exports = {
  composeBiome,
  allocateResources,
  forageStep,
  ecosystemHealth,
  sessionSnapshot,
  allocateSessionResources,
  forageSession,
  assessSessionHealth,
  recordObservationDecisions,
  finalizeBiomeSession,
  rehydrate
};
