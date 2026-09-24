'use strict';

/**
 * @file metapopulationCoordinationService.js
 * @description Metapopulation coordination: semi-independent populations that
 * sense a quorum, adapt their connections and regenerate lost roles. Wires the
 * declared mechanisms (quorum_sensing, synaptic_plasticity, regeneration) to
 * concrete, testable functions.
 */
const biologicalModeService = require('./biologicalModeService');
const topologyCapabilityService = require('./topologyCapabilityService');
const metapopulationStore = require('./metapopulation/metapopulationStore');
const { validateMetapopulationSession } = require('./metapopulation/contracts/metapopulationContract');
const { validateRegionalEvent } = require('./metapopulation/contracts/regionalEventContract');
const patchService = require('./metapopulation/patches/patchService');
const patchLifecycleService = require('./metapopulation/patches/patchLifecycleService');
const demeService = require('./metapopulation/demes/demeService');
const demeLifecycleService = require('./metapopulation/demes/demeLifecycleService');
const demeLocalEvolutionService = require('./metapopulation/demes/demeLocalEvolutionService');
const demeIsolationService = require('./metapopulation/demes/demeIsolationService');
const demeHeartbeatService = require('./metapopulation/demes/demeHeartbeatService');
const regionalLivenessService = require('./metapopulation/observability/regionalLivenessService');
const corridorGraphService = require('./metapopulation/migration/corridorGraphService');
const { buildCorridors } = require('./metapopulation/migration/corridorTopologyService');
const propaguleMigrationService = require('./metapopulation/migration/propaguleMigrationService');
const migrationAdapterRegistry = require('./metapopulation/migration/migrationAdapterRegistry');
const migrationPolicyService = require('./metapopulation/migration/migrationPolicyService');
const adaptiveMigrationTriggerService = require('./metapopulation/migration/adaptiveMigrationTriggerService');
const regionalContributionService = require('./metapopulation/observability/regionalContributionService');
const rescueEffectService = require('./metapopulation/migration/rescueEffectService');
const demeRecoveryService = require('./metapopulation/demes/demeRecoveryService');
const recolonizationService = require('./metapopulation/patches/recolonizationService');
const independentQuorumService = require('./metapopulation/observability/independentQuorumService');
const antiSynchronyService = require('./metapopulation/observability/antiSynchronyService');
const regionalUtilityService = require('./metapopulation/observability/regionalUtilityService');

const DEFAULT_ORGANIZATION = 'quorum_with_abstention';
const DEFAULT_QUORUM_RATIO = 0.5;
const sessions = new Map();

function composeMetapopulation(mission, options = {}) {
  const goal = String(mission || '').trim();
  if (!goal) {
    throw Object.assign(new Error('Metapopulation mission is required.'), { code: 'METAPOPULATION_MISSION_REQUIRED' });
  }
  const members = biologicalModeService.compose('metapopulation', goal);
  const organization = options.organization || DEFAULT_ORGANIZATION;
  return {
    mode: 'metapopulation',
    mission: goal,
    organization,
    mechanisms: members[0]?.mechanisms || [],
    capabilityContract: topologyCapabilityService.contractFor({ mode: 'metapopulation', organization }),
    members
  };
}

async function createMetapopulationSession(mission, options = {}) {
  const composition = composeMetapopulation(mission, options);
  const id = options.metapopulationId || require('crypto').randomUUID();
  const now = new Date().toISOString();
  const session = validateMetapopulationSession({
    metapopulationId: id,
    missionId: options.missionId || id,
    mission: composition.mission,
    organization: composition.organization,
    scope: options.scope || 'mission',
    patches: [],
    demes: [],
    migrationGraph: { corridors: [] },
    regionalMemory: {},
    status: 'FORMING',
    generation: 0,
    revision: 1,
    createdAt: now,
    updatedAt: now
  });
  const event = {
    type: 'SESSION_CREATED',
    payload: { missionId: session.missionId, scope: session.scope },
    provenance: options.provenance || { source: 'metapopulationCoordinationService' },
    actor: options.actor || options.orchestratorId || 'metapopulation-runtime',
    occurredAt: now
  };
  if (options.db) await metapopulationStore.createSession(options.db, session, event);
  const result = { ...composition, ...session, sessionId: id, persistence: options.db ? 'durable' : 'memory' };
  sessions.set(id, result);
  return result;
}

async function getMetapopulationSession(metapopulationId, options = {}) {
  const stored = options.db ? await metapopulationStore.loadSession(options.db, metapopulationId) : null;
  const session = stored || sessions.get(metapopulationId);
  if (!session) {
    throw Object.assign(new Error('Unknown metapopulation session.'), { code: 'METAPOPULATION_SESSION_UNKNOWN' });
  }
  const composition = composeMetapopulation(session.mission, { organization: session.organization });
  const hydrated = { ...composition, ...session, sessionId: session.metapopulationId || session.sessionId };
  sessions.set(hydrated.sessionId, hydrated);
  return hydrated;
}

async function recordMetapopulationEvent(metapopulationId, event, options = {}) {
  const session = await getMetapopulationSession(metapopulationId, options);
  const nextRevision = session.revision + 1;
  const proposed = validateRegionalEvent({
    ...event,
    sequence: nextRevision,
    revision: nextRevision,
    actor: event.actor || options.actor || 'metapopulation-runtime',
    provenance: event.provenance || options.provenance || {},
    occurredAt: event.occurredAt || new Date().toISOString()
  });
  const committed = options.db
    ? await metapopulationStore.appendEvent(options.db, metapopulationId, proposed)
    : proposed;
  session.revision = committed.revision;
  session.updatedAt = committed.occurredAt;
  sessions.set(metapopulationId, session);
  return committed;
}

async function listMetapopulationEvents(metapopulationId, options = {}) {
  if (!options.db) {
    throw Object.assign(new Error('A database is required to read the regional event journal.'), { code: 'METAPOPULATION_DB_REQUIRED' });
  }
  return metapopulationStore.listEvents(options.db, metapopulationId);
}

function senseQuorum(members, options = {}) {
  const list = Array.isArray(members) ? members : [];
  const threshold = Number.isFinite(options.evidenceThreshold) ? options.evidenceThreshold : 0.5;
  const quorumRatio = Number.isFinite(options.quorumRatio) ? options.quorumRatio : DEFAULT_QUORUM_RATIO;
  let totalWeight = 0;
  let supportWeight = 0;
  for (const member of list) {
    const weight = Number.isFinite(member?.weight) && member.weight > 0 ? member.weight : 1;
    totalWeight += weight;
    const score = Number(member?.evidenceScore);
    if (Number.isFinite(score) && score >= threshold) supportWeight += weight;
  }
  const support = totalWeight > 0 ? Number((supportWeight / totalWeight).toFixed(3)) : 0;
  return { reached: support >= quorumRatio, support, quorumRatio, threshold, responders: list.length };
}

function regenerationPlan(lostRoles, options = {}) {
  const roles = Array.isArray(lostRoles) ? lostRoles.filter(Boolean) : [];
  const maxRespawn = Number.isFinite(options.maxRespawn) ? Math.max(0, options.maxRespawn) : roles.length;
  return {
    respawn: roles.slice(0, maxRespawn),
    skipped: roles.slice(maxRespawn),
    sources: ['lineage', 'episodic_memory', 'cryptobiosis'],
    degraded: roles.length > maxRespawn
  };
}

function connectionWeights(connections, outcomes = {}) {
  const list = Array.isArray(connections) ? connections : [];
  return list.map((connection) => {
    const key = connection?.id || connection?.target;
    const outcome = Number.isFinite(outcomes[key]) ? outcomes[key] : (Number.isFinite(connection?.outcome) ? connection.outcome : 0);
    const weight = Math.max(0, Math.min(1, Number(connection?.weight ?? 0.5) + outcome * 0.1));
    return { ...connection, weight: Number(weight.toFixed(3)) };
  });
}

async function createPatch(metapopulationId, patch, options = {}) {
  return patchService.createPatch(patch, { ...options, metapopulationId });
}

async function listPatches(metapopulationId, options = {}) {
  return patchService.listPatches({ ...options, metapopulationId });
}

async function getPatch(metapopulationId, patchId, options = {}) {
  return patchService.getPatch(patchId, { ...options, metapopulationId });
}

async function createDeme(metapopulationId, deme, options = {}) {
  return demeService.createDeme(deme, { ...options, metapopulationId });
}

async function getDeme(metapopulationId, demeId, options = {}) {
  return demeService.getDeme(demeId, { ...options, metapopulationId });
}

async function listDemes(metapopulationId, options = {}) {
  return demeService.listDemes({ ...options, metapopulationId });
}

async function transitionPatch(input, options = {}) {
  return patchLifecycleService.transitionPatch(input, options);
}

async function transitionDeme(input, options = {}) {
  return demeLifecycleService.transitionDeme(input, options);
}

async function updateDemeLocalProfile(input, options = {}) {
  return demeLocalEvolutionService.updateLocalProfile(input, options);
}

async function provisionDemeWorkspace(input, options = {}) {
  return demeIsolationService.provisionDemeWorkspace(input, options);
}

async function assertDemeLocalWrite(input, options = {}) {
  return demeIsolationService.assertLocalWrite(input, options);
}

async function heartbeatDeme(input, options = {}) {
  return demeHeartbeatService.heartbeat(input, options);
}

async function inspectRegionalLiveness(metapopulationId, options = {}) {
  return regionalLivenessService.inspectRegion(metapopulationId, options);
}

async function consumeDemeBudget(input, options = {}) {
  if (!options.db) throw Object.assign(new Error('A database is required.'), { code: 'METAPOPULATION_DB_REQUIRED' });
  return metapopulationStore.consumeDemeBudget(options.db, input);
}

function buildMigrationGraph(demes, options = {}) {
  return buildCorridors(demes, options);
}

async function planMigrationTopology(metapopulationId, options = {}) {
  return corridorGraphService.planTopology(metapopulationId, options);
}

async function applyMigrationTopology(metapopulationId, options = {}) {
  return corridorGraphService.applyTopology(metapopulationId, options);
}

async function listMigrationCorridors(metapopulationId, options = {}) {
  return corridorGraphService.listCorridors(metapopulationId, options);
}

async function offerPropagule(input, options = {}) {
  return propaguleMigrationService.offerPropagule(input, options);
}

async function listPropaguleQuarantine(input, options = {}) {
  return propaguleMigrationService.listPropaguleQuarantine(input, options);
}

async function reviewPropagule(input, options = {}) {
  return propaguleMigrationService.reviewPropagule(input, options);
}

function registerMigrationAdapter(type, adapter) {
  return migrationAdapterRegistry.registerAdapter(type, adapter);
}

function selectMigrationCandidates(candidates, options = {}) {
  return migrationPolicyService.selectCandidates(candidates, options);
}

function planPushMigration(input) {
  return migrationPolicyService.planPush(input);
}

function queryPullMigration(input) {
  return migrationPolicyService.queryPull(input);
}

function evaluateMigrationTrigger(input) {
  return adaptiveMigrationTriggerService.evaluateTrigger(input);
}

function analyzeRegionalContribution(demes, corridors, options = {}) {
  return regionalContributionService.analyzeContribution(demes, corridors, options);
}

async function planRescueMigration(input, options = {}) {
  return rescueEffectService.planRescueMigration(input, options);
}

function evaluateRescueOutcome(input) {
  return rescueEffectService.evaluateRescueOutcome(input);
}

async function rollbackRescueMigration(input, options = {}) {
  return propaguleMigrationService.rollbackRescue(input, options);
}

module.exports = {
  composeMetapopulation,
  createMetapopulationSession,
  getMetapopulationSession,
  recordMetapopulationEvent,
  listMetapopulationEvents,
  createPatch,
  getPatch,
  listPatches,
  createDeme,
  getDeme,
  listDemes,
  transitionPatch,
  transitionDeme,
  updateDemeLocalProfile,
  provisionDemeWorkspace,
  assertDemeLocalWrite,
  heartbeatDeme,
  inspectRegionalLiveness,
  consumeDemeBudget,
  buildMigrationGraph,
  planMigrationTopology,
  applyMigrationTopology,
  listMigrationCorridors,
  offerPropagule,
  listPropaguleQuarantine,
  reviewPropagule,
  registerMigrationAdapter,
  selectMigrationCandidates,
  planPushMigration,
  queryPullMigration,
  evaluateMigrationTrigger,
  analyzeRegionalContribution,
  planRescueMigration,
  evaluateRescueOutcome,
  rollbackRescueMigration,
  ...demeRecoveryService,
  ...recolonizationService,
  ...independentQuorumService,
  ...antiSynchronyService,
  ...regionalUtilityService,
  senseQuorum,
  regenerationPlan,
  connectionWeights
};
