'use strict';
/**
 * @file biomeCoordinationService.js
 * @description Biome coordination: an operating environment of specialized
 * populations. Wires ecological resource allocation, optimal foraging and the
 * swarm diversity metric instead of leaving them as prompt-only mechanisms.
 */
const biologicalModeService = require('./biologicalModeService');
const topologyCapabilityService = require('./topologyCapabilityService');
const biofilmMatrix = require('./biofilmMatrixService');
const biomeSessionStore = require('./biome/biomeSessionStore');
const sessionPersistence = require('./biome/biomeSessionPersistence');
const biomeStore = require('./biome/biomeStore');
const { createEcologicalEvent } = require('./biome/contracts/ecologicalEvent');
const environmentModelService = require('./biome/environment/environmentModelService');
const nicheDiscoveryService = require('./biome/niches/nicheDiscoveryService');
const nicheLifecycleService = require('./biome/niches/nicheLifecycleService');
const nicheStore = require('./biome/niches/nicheStore');
const agentNicheService = require('./biome/niches/agentNicheService');
const populationRuntimeService = require('./biome/populations/populationRuntimeService');
const ecologicalForagingController = require('./biome/foraging/ecologicalForagingController');
const foragingActionExecutor = require('./biome/foraging/foragingActionExecutor');
const biomeVariantPolicy = require('./biome/variants/variantPolicyService');
const biomeVariantRuntime = require('./biome/variants/variantRuntimeService');
const biomeVariantOperations = require('./biome/variants/variantSessionOperations');
const { sourceOpportunities, advanceSuccessionPhase, healthAssessment, allocationOptions,
  allocateResources, forageStep, ecosystemHealth } = biomeVariantOperations;
const crypto = require('crypto');
const DEFAULT_ORGANIZATION = 'energy_huddle';
const MECHANISMS = ['resource_allocation', 'optimal_foraging', 'quorum_sensing'];
const sessions = new Map();
async function composeBiome(mission, options = {}) {
  const goal = requiredMission(mission);
  const variant = biomeVariantPolicy.select(goal, options);
  const organization = options.organization || DEFAULT_ORGANIZATION;
  const scope = options.scope || variant.scope;
  const sessionId = `biome-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const persistenceKey = persistentKey(scope, options, sessionId);
  const session = createSession({ goal, variant, organization, scope, sessionId, persistenceKey, options });
  initializeSuccession(session);
  await restorePersistent(session, options.db);
  sessions.set(session.sessionId, session);
  await sessionPersistence.persist(session, options.db);
  return session;
}

function requiredMission(mission) {
  const goal = String(mission || '').trim();
  if (!goal) throw Object.assign(new Error('Biome mission is required.'), { code: 'BIOME_MISSION_REQUIRED' });
  return goal;
}

function persistentKey(scope, options, sessionId) {
  if (scope !== 'persistent') return null;
  return String(options.persistenceKey || options.environment?.environmentId || sessionId);
}

function createSession(context) {
  const { goal, variant, organization, scope, sessionId, persistenceKey, options } = context;
  const environmentModel = environmentModelService.createEnvironmentModel({
    environmentId: persistenceKey || `${sessionId}:environment`, mission: goal, scope, environment: options.environment
  });
  return {
    sessionId,
    biomeId: sessionId,
    revision: null,
    ecology: biomeStore.createBiomeState({
      biomeId: sessionId, missionId: sessionId, scope,
      environment: environmentModel.environment
    }),
    mode: 'biome',
    mission: goal,
    variant: variant.variant,
    variantPolicy: variant,
    variantSelection: variant.selection,
    variantState: {},
    persistenceKey,
    organization,
    mechanisms: MECHANISMS,
    capabilityContract: topologyCapabilityService.contractFor({ mode: 'biome', organization }),
    matrix: biofilmMatrix.createMatrix(`biome-${Date.now()}`, options),
    members: createMembers(goal, variant, sessionId)
  };
}

function createMembers(goal, variant, sessionId) {
  return biologicalModeService.compose('biome', goal).map((member) => ({ ...member, variant: variant.variant,
    mission: `${member.mission}\n\nBIOME VARIANT ${variant.variant}: ${variant.focus}`,
    runtimeContext: { biomeId: sessionId, sessionId, populationId: `population-${member.role}`, nicheId: `niche-${member.role}` } }));
}

function initializeSuccession(session) {
  if (session.variant === 'successional') session.ecology.ecologicalState.successionPhase = 'pioneer';
}

async function restorePersistent(session, db) {
  if (!session.persistenceKey || !db) return;
  const stored = await biomeSessionStore.loadPersistentEnvironment(db, session.persistenceKey);
  sessionPersistence.restorePersistentEnvironment(session, stored);
}

async function getSession(sessionId, db) {
  if (db) {
    const record = await biomeSessionStore.load(db, sessionId);
    if (record) {
      const session = sessionPersistence.rehydrate(record);
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
    sessionId, mode: 'biome', version: session.matrix.version, variant: session.variant,
    variantState: session.variantState || {},
    environment: session.ecology.environment,
    environmentConstraints: session.ecology.environmentConstraints,
    ecologicalState: session.ecology.ecologicalState,
    resourcePool: session.ecology.resourcePool,
    opportunities: session.ecology.opportunityMap,
    niches: session.ecology.niches,
    populations: session.ecology.populations,
    entries: biofilmMatrix.read(session.matrix)
  };
}

async function advanceSessionVariant(sessionId, input = {}, options = {}) {
  const operationOptions = { ...options, evidenceRefs: options.evidenceRefs || input.evidenceRefs || [] };
  return applyOperation({ sessionId, options: operationOptions, operation: 'variant_advance', input,
    apply: (session) => {
      const result = biomeVariantRuntime.advance({ ecology: session.ecology, variant: session.variant, state: session.variantState, input, matrix: session.matrix });
      session.variantState = result.state;
      biofilmMatrix.deposit(session.matrix, { key: `variant:${session.matrix.version + 1}`, kind: 'variant_decision',
        variant: result.variant, decision: result.decision });
      return { ...result, matrixVersion: session.matrix.version };
    }
  });
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
    sessionId, options, operation: 'niche_discovery', input: { failureClusters, knowledgeSources: options.knowledgeSources },
    apply: (session) => {
      const candidates = nicheDiscoveryService.discoverNiches({
        opportunityMap: [...session.ecology.opportunityMap, ...sourceOpportunities(session, options.knowledgeSources)],
        failureClusters,
        existingNiches: session.ecology.niches
      });
      for (const candidate of candidates) session.ecology.niches = nicheStore.upsertNiche(session.ecology.niches, candidate);
      const successionPhase = advanceSuccessionPhase(session.ecology, session.variantPolicy);
      return {
        candidates,
        successionPhase,
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
      const lifecycleOptions = {
        ...options,
        minimumOpportunityScore: options.minimumOpportunityScore ?? session.variantPolicy?.growthThreshold
      };
      const updated = nicheLifecycleService.advanceNiche(niche, measurements, lifecycleOptions);
      session.ecology.niches = nicheStore.upsertNiche(session.ecology.niches, updated);
      const successionPhase = advanceSuccessionPhase(session.ecology, session.variantPolicy, measurements);
      return { niche: updated, successionPhase, action: { type: 'NICHE_STATUS_CHANGED', status: updated.status, nicheId } };
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
    apply: (session) => {
      const result = populationRuntimeService.execute(session.ecology, command, options);
      const successionPhase = advanceSuccessionPhase(session.ecology, session.variantPolicy, command.measurements);
      return { ...result, successionPhase };
    }
  });
}

async function manageSessionResources({ sessionId, command, options = {} }) {
  return applyOperation({
    sessionId, options, operation: command.type, input: command,
    apply: (session) => populationRuntimeService.execute(session.ecology, command, options)
  });
}

async function assessSessionCapacity({ sessionId, measurements = {}, thresholds = {}, garageCapacity, options = {} }) {
  const command = { type: 'capacity_assess', measurements, thresholds, garageCapacity };
  return applyOperation({
    sessionId, options, operation: 'capacity_assess', input: command,
    apply: (session) => populationRuntimeService.execute(session.ecology, command, options)
  });
}

async function allocateSessionResources(sessionId, populations, options = {}) {
  const session = await getSession(sessionId, options.db);
  const settings = allocationOptions(session, options, populations.length);
  const allocation = allocateResources(populations, settings);
  const result = {
    ...allocation,
    totalBudget: settings.requestedBudget,
    spendableBudget: settings.totalBudget,
    recoveryReserveBudget: settings.recoveryReserveBudget
  };
  return applyOperation({ sessionId, options, operation: 'allocate', input: { populations, totalBudget: options.totalBudget, minimumPerPopulation: options.minimumPerPopulation }, apply: (session) => {
    session.ecology.ecologicalState.recoveryBudgetReserve = (session.ecology.ecologicalState.recoveryBudgetReserve || 0)
      + result.recoveryReserveBudget;
    for (const allocation of result.allocations) {
      biofilmMatrix.deposit(session.matrix, { key: `resource:${allocation.id}`, kind: 'resource_allocation', ...allocation });
    }
    if (result.recoveryReserveBudget > 0) biofilmMatrix.deposit(session.matrix, {
      key: `recovery-reserve:${session.matrix.version + 1}`, kind: 'recovery_budget_reserve', budget: result.recoveryReserveBudget
    });
    return { ...result, matrixVersion: session.matrix.version,
      action: { type: 'BIOME_BUDGET_ALLOCATED', status: 'applied', allocations: result.allocations, recoveryReserveBudget: result.recoveryReserveBudget } };
  } });
}

async function forageSession(sessionId, patchHistory, options = {}) {
  return applyOperation({ sessionId, options, operation: 'forage', input: {
    patchHistory, currentPatchId: options.currentPatchId, alternativePatches: options.alternativePatches,
    alternativePatch: options.alternativePatch, populationId: options.populationId,
    individualId: options.individualId, migrationCost: options.migrationCost,
    switchCost: options.switchCost, elapsedTimeSec: options.elapsedTimeSec
  }, apply: (session) => {
    const alternatives = options.alternativePatches || legacyAlternative(options);
    const decision = ecologicalForagingController.decide({
      ecology: session.ecology, patchHistory, currentPatchId: currentPatch(options),
      currentDescriptor: options.currentDescriptor, currentMarginalReturn: options.currentMarginalReturn,
      currentSpace: options.currentSpace, stepsWithoutProgress: options.stepsWithoutProgress, iteration: options.iteration,
      alternatives, switchCost: options.switchCost, elapsedTimeSec: options.elapsedTimeSec,
      environmentThreshold: options.environmentThreshold ?? session.variantPolicy?.environmentThreshold
    });
    persistPatchHistory(session.ecology, currentPatch(options), patchHistory);
    const executed = foragingActionExecutor.execute(session.ecology, decision, options);
    const result = { ...decision, ...executed, levyStep: forageStep(patchHistory, options).levyStep };
    biofilmMatrix.deposit(session.matrix, { key: `forage:${session.matrix.version + 1}`, kind: 'foraging_observation', ...result });
    return { ...result, matrixVersion: session.matrix.version };
  } });
}

function legacyAlternative(options) {
  return options.alternativePatch ? [{ patchId: options.alternativePatch, descriptor: options.alternativePatch,
    expectedReturn: options.alternativeReturn, switchCost: options.switchCost }] : [];
}

function currentPatch(options) {
  return options.currentPatchId || options.currentPatch || null;
}

function persistPatchHistory(ecology, patchId, patchHistory) {
  if (!patchId) return;
  const histories = ecology.ecologicalState.patchHistories || {};
  ecology.ecologicalState.patchHistories = { ...histories, [patchId]: patchHistory };
}

async function assessSessionHealth(sessionId, observations, options = {}) {
  return applyOperation({ sessionId, options, operation: 'health', input: { observations }, apply: (session) => {
    const result = healthAssessment(session, observations);
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
  return biomeSessionStore.mutate({ db: options.db, id: sessionId, actorId, operation, mutator: async (record) => {
    const session = sessionPersistence.rehydrate(record);
    const output = await apply(session);
    session.ecology.tick += 1;
    const resultingRevision = record.revision + 1;
    const receipt = makeReceipt({ ...context, output, previousRevision: record.revision, resultingRevision });
    return { state: sessionPersistence.serialize(session), event: { ...receipt }, result: { sessionId, ...output, receipt } };
  } });
}

async function applyMemoryOperation(context) {
  const session = await getSession(context.sessionId);
  const previousRevision = session.revision || 0;
  const output = await context.apply(session);
  session.ecology.tick += 1;
  session.revision = previousRevision + 1;
  const receipt = makeReceipt({ ...context, output, previousRevision, resultingRevision: session.revision });
  return { sessionId: context.sessionId, ...output, receipt };
}

function makeReceipt(context) {
  const { sessionId, options, operation, input, operationId, timestamp, actorId, output, previousRevision, resultingRevision } = context;
  const appliedActions = output.action ? [output.action]
    : (output.allocations || []).map((allocation) => ({ type: 'RESOURCE_ALLOCATION', ...allocation }));
  return createEcologicalEvent({ operationId, sessionId, actorId, previousRevision, resultingRevision, input,
    decision: output.decision || output.patchYield?.decision || operation, appliedActions,
    evidenceRefs: options.evidenceRefs || [], timestamp });
}

module.exports = {
  composeBiome,
  allocateResources,
  forageStep,
  ecosystemHealth,
  selectBiomeVariant: biomeVariantPolicy.select,
  sessionSnapshot,
  advanceSessionVariant,
  allocateSessionResources,
  forageSession,
  assessSessionHealth,
  updateSessionEnvironment,
  discoverSessionNiches,
  updateNicheLifecycle,
  assessSessionIndividuals,
  updateSessionPopulation,
  manageSessionResources,
  assessSessionCapacity,
  rehydrate
};
