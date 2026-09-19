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
  return { sessionId: record.id, ...state, matrix };
}

async function persist(session, db) {
  if (db) await topologySessionStore.save(db, { id: session.sessionId, topology: 'biome', state: serialize(session) });
}

async function composeBiome(mission, options = {}) {
  const goal = String(mission || '').trim();
  if (!goal) {
    throw Object.assign(new Error('Biome mission is required.'), { code: 'BIOME_MISSION_REQUIRED' });
  }
  const organization = options.organization || DEFAULT_ORGANIZATION;
  const session = {
    sessionId: `biome-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
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
    levyStep: defaultForaging.computeLevyFlightStep(iteration)
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
  rehydrate
};
