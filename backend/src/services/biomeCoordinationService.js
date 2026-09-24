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
const biomeSessionStore = require('./biome/biomeSessionStore');
const biomeStore = require('./biome/biomeStore');
const { createEcologicalEvent } = require('./biome/contracts/ecologicalEvent');
const environmentModelService = require('./biome/environment/environmentModelService');
const nicheDiscoveryService = require('./biome/niches/nicheDiscoveryService');
const nicheLifecycleService = require('./biome/niches/nicheLifecycleService');
const nicheStore = require('./biome/niches/nicheStore');
const agentNicheService = require('./biome/niches/agentNicheService');
const populationRuntimeService = require('./biome/populations/populationRuntimeService');
const crypto = require('crypto');

const DEFAULT_ORGANIZATION = 'energy_huddle';
const MECHANISMS = ['resource_allocation', 'optimal_foraging', 'quorum_sensing'];
const sessions = new Map();

function serialize(session) {
  return {
    mission: session.mission,
    biomeId: session.biomeId,
    ecology: session.ecology,
    revision: session.revision,
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
  return {
    sessionId: record.id,
    biomeId: state.biomeId || record.id,
    revision: record.revision,
    ...state,
    ecology: state.ecology || biomeStore.createBiomeState({ biomeId: state.biomeId || record.id, missionId: record.id }),
    matrix
  };
}

async function persist(session, db) {
  if (db) {
    const saved = await biomeSessionStore.create(db, { id: session.sessionId, state: serialize(session) });
    session.revision = saved.revision;
  }
}

async function composeBiome(mission, options = {}) {
  const goal = String(mission || '').trim();
  if (!goal) {
    throw Object.assign(new Error('Biome mission is required.'), { code: 'BIOME_MISSION_REQUIRED' });
  }
  const organization = options.organization || DEFAULT_ORGANIZATION;
  const sessionId = `biome-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const environmentModel = environmentModelService.createEnvironmentModel({
    environmentId: `${sessionId}:environment`, mission: goal, scope: options.scope, environment: options.environment
  });
  const session = {
    sessionId,
    biomeId: sessionId,
    revision: null,
    ecology: biomeStore.createBiomeState({
      biomeId: sessionId, missionId: sessionId, scope: options.scope,
      environment: environmentModel.environment
    }),
    mode: 'biome',
    mission: goal,
    organization,
    mechanisms: MECHANISMS,
    capabilityContract: topologyCapabilityService.contractFor({ mode: 'biome', organization }),
    matrix: biofilmMatrix.createMatrix(`biome-${Date.now()}`, options),
    members: biologicalModeService.compose('biome', goal).map((member) => ({
      ...member,
      runtimeContext: {
        biomeId: sessionId,
        sessionId,
        populationId: `population-${member.role}`,
        nicheId: `niche-${member.role}`
      }
    }))
  };
  sessions.set(session.sessionId, session);
  await persist(session, options.db);
  return session;
}

async function getSession(sessionId, db) {
  if (db) {
    const record = await biomeSessionStore.load(db, sessionId);
    if (record) {
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
  return {
    sessionId, mode: 'biome', version: session.matrix.version,
    environment: session.ecology.environment,
    environmentConstraints: session.ecology.environmentConstraints,
    ecologicalState: session.ecology.ecologicalState,
    opportunities: session.ecology.opportunityMap,
    niches: session.ecology.niches,
    populations: session.ecology.populations,
    entries: biofilmMatrix.read(session.matrix)
  };
}

async function updateSessionEnvironment(sessionId, patch, options = {}) {
  return applyOperation({
    sessionId, options, operation: 'environment', input: { patch, reason: options.reason, evidenceRefs: options.evidenceRefs },
    apply: (session) => {
      const updated = environmentModelService.applyEnvironmentUpdate({
        environment: session.ecology.environment, patch, reason: options.reason, evidenceRefs: options.evidenceRefs
      });
      session.ecology.environment = updated.environment;
      session.ecology.environmentConstraints = updated.constraints.evaluations;
      session.ecology.opportunityMap = updated.opportunities;
      return { ...updated, action: { type: 'ENVIRONMENT_VERSIONED', status: 'applied', version: updated.environment.version } };
    }
  });
}

async function discoverSessionNiches(sessionId, failureClusters = [], options = {}) {
  return applyOperation({
    sessionId, options, operation: 'niche_discovery', input: { failureClusters },
    apply: (session) => {
      const candidates = nicheDiscoveryService.discoverNiches({
        opportunityMap: session.ecology.opportunityMap,
        failureClusters,
        existingNiches: session.ecology.niches
      });
      for (const candidate of candidates) session.ecology.niches = nicheStore.upsertNiche(session.ecology.niches, candidate);
      return {
        candidates,
        action: { type: 'NICHE_CANDIDATES_RECORDED', status: 'applied', candidateCount: candidates.length }
      };
    }
  });
}

async function updateNicheLifecycle({ sessionId, nicheId, measurements = {}, options = {} }) {
  return applyOperation({
    sessionId, options, operation: 'niche_lifecycle', input: { nicheId, measurements },
    apply: (session) => {
      const niche = session.ecology.niches.find((item) => item.nicheId === nicheId);
      if (!niche) throw Object.assign(new Error(`Unknown biome niche '${nicheId}'.`), { code: 'BIOME_NICHE_UNKNOWN' });
      const updated = nicheLifecycleService.advanceNiche(niche, measurements, options);
      session.ecology.niches = nicheStore.upsertNiche(session.ecology.niches, updated);
      return { niche: updated, action: { type: 'NICHE_STATUS_CHANGED', status: updated.status, nicheId } };
    }
  });
}

async function assessSessionIndividuals(sessionId, individuals, options = {}) {
  return applyOperation({
    sessionId, options, operation: 'individual_niche_assessment', input: { individuals },
    apply: (session) => {
      const assessments = agentNicheService.assessAndStore(session.ecology, individuals);
      return {
        individuals: assessments,
        action: { type: 'INDIVIDUAL_NICHES_ASSESSED', status: 'applied', count: assessments.length }
      };
    }
  });
}

async function updateSessionPopulation({ sessionId, command, options = {} }) {
  return applyOperation({
    sessionId, options, operation: `population_${command.type}`, input: command,
    apply: (session) => populationRuntimeService.execute(session.ecology, command)
  });
}

async function allocateSessionResources(sessionId, populations, options = {}) {
  const result = allocateResources(populations, options);
  return applyOperation({ sessionId, options, operation: 'allocate', input: { populations, totalBudget: options.totalBudget, minimumPerPopulation: options.minimumPerPopulation }, apply: (session) => {
    for (const allocation of result.allocations) {
      biofilmMatrix.deposit(session.matrix, { key: `resource:${allocation.id}`, kind: 'resource_allocation', ...allocation });
    }
    return { ...result, matrixVersion: session.matrix.version };
  } });
}

async function forageSession(sessionId, patchHistory, options = {}) {
  const result = forageStep(patchHistory, options);
  return applyOperation({ sessionId, options, operation: 'forage', input: { patchHistory, iteration: options.iteration, elapsedTimeSec: options.elapsedTimeSec, alternativePatch: options.alternativePatch }, apply: (session) => {
    const action = result.patchYield.decision === 'PATCH_DEPARTURE'
      ? { type: 'MIGRATE_PATCH', status: 'requested', targetPatch: options.alternativePatch || null }
      : { type: 'CONTINUE_FORAGING', status: 'applied' };
    biofilmMatrix.deposit(session.matrix, { key: `forage:${session.matrix.version + 1}`, kind: 'foraging_observation', ...result, action });
    return { ...result, action, matrixVersion: session.matrix.version };
  } });
}

async function assessSessionHealth(sessionId, observations, options = {}) {
  const result = ecosystemHealth(observations);
  return applyOperation({ sessionId, options, operation: 'health', input: { observations }, apply: (session) => {
    biofilmMatrix.deposit(session.matrix, { key: `health:${session.matrix.version + 1}`, kind: 'ecosystem_health', ...result });
    return { ...result, matrixVersion: session.matrix.version };
  } });
}

async function applyOperation({ sessionId, options, operation, input, apply }) {
  const context = { sessionId, options, operation, input, apply, operationId: crypto.randomUUID(), timestamp: new Date().toISOString(), actorId: options.actorId || 'system' };
  return options.db ? applyPersistedOperation(context) : applyMemoryOperation(context);
}

async function applyPersistedOperation(context) {
  const { sessionId, options, operation, input, apply, operationId, timestamp, actorId } = context;
  return biomeSessionStore.mutate({ db: options.db, id: sessionId, actorId, operation, mutator: (record) => {
    const session = rehydrate(record);
    const output = apply(session);
    const resultingRevision = record.revision + 1;
    const receipt = makeReceipt({ ...context, output, previousRevision: record.revision, resultingRevision });
    return { state: serialize(session), event: { ...receipt }, result: { sessionId, ...output, receipt } };
  } });
}

async function applyMemoryOperation(context) {
  const session = await getSession(context.sessionId);
  const previousRevision = session.revision || 0;
  const output = context.apply(session);
  session.revision = previousRevision + 1;
  const receipt = makeReceipt({ ...context, output, previousRevision, resultingRevision: session.revision });
  return { sessionId: context.sessionId, ...output, receipt };
}

function makeReceipt(context) {
  const { sessionId, options, operation, input, operationId, timestamp, actorId, output, previousRevision, resultingRevision } = context;
  const appliedActions = output.action ? [output.action]
    : (output.allocations || []).map((allocation) => ({ type: 'RESOURCE_ALLOCATION', ...allocation }));
  return createEcologicalEvent({ operationId, sessionId, actorId, previousRevision, resultingRevision, input,
    decision: output.patchYield?.decision || operation, appliedActions,
    evidenceRefs: options.evidenceRefs || [], timestamp });
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
  const patchYield = defaultForaging.evaluatePatchYield(Array.isArray(patchHistory) ? patchHistory : [], elapsedTimeSec);
  return {
    patchYield,
    levyStep: defaultForaging.computeLevyFlightStep(iteration)
  };
}

function ecosystemHealth(observations) {
  const labels = (Array.isArray(observations) ? observations : []).map((observation) => (typeof observation === 'string' ? observation : observation?.label)).filter(Boolean);
  if (!labels.length) return { behavioralDiversity: null, ecosystemHealth: 'unknown', verdict: 'unknown' };
  const entropy = swarmMetricsService.calculateShannonEntropy(labels);
  return { behavioralDiversity: entropy.normalizedEntropy, ecosystemHealth: 'unknown', verdict: 'unknown' };
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
  updateSessionEnvironment,
  discoverSessionNiches,
  updateNicheLifecycle,
  assessSessionIndividuals,
  updateSessionPopulation,
  rehydrate
};
