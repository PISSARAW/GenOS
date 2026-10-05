'use strict';

const crypto = require('node:crypto');
const store = require('./axolotlStateStore');
const helpers = require('./axolotlRegenerationHelpers');
const nursery = require('./axolotlNurseryService');
const costs = require('./axolotlRegenerationCostService');
let database = null;
let legacySessions = new Map();

function setAdaptivePersister(persister) { database = persister?.db || database; }
function setStateStore(sessions) { legacySessions = new Map(sessions); }
function resolveDb(db) { if (!db && !database) throw store.error('AXOLOTL_DATABASE_REQUIRED'); return db || database; }

async function assessRegenerationNeed({ failureContext, lastSnapshot, currentTopology }) {
  if (!failureContext) return null;
  if (!failureContext.structural && lastSnapshot?.valid) return { needed: false, mode: 'restore_classic', reason: 'Snapshot valide disponible' };
  if (!failureContext.structural && !['high', 'critical'].includes(failureContext.severity)) return null;
  const damaged = failureContext.componentIds || [];
  const targeted = damaged.length > 0 && damaged.every((id) => currentTopology?.components?.some((node) => node.id === id));
  return { needed: true, structural: failureContext.structural === true,
    mode: targeted ? 'partial_regeneration' : 'global_regeneration',
    scope: targeted ? { type: 'components', componentIds: damaged } : { type: 'global' }, reason: 'Régénération fonctionnelle requise' };
}

async function planRegeneration(input) {
  const db = resolveDb(input.db);
  await store.ensure(db);
  const owner = await store.assertOwner(db, input.orchestratorId);
  const currentTopology = helpers.validateGraph(store.clone(input.currentTopology));
  const contract = nursery.validateContract(input.functionalContract);
  const scope = helpers.normalizeScope(input.scope, currentTopology);
  const budget = nursery.validateBudget(input.executionBudget);
  const session = { id: `regen_${crypto.randomUUID()}`, orchestratorId: owner.id, workspaceId: owner.workspace_id,
    mission: input.mission, reason: input.reason, createdAt: new Date().toISOString(), status: 'planned',
    scope, currentTopology, functionalContract: contract, budget, preserved: store.clone(input.preferredPreservation || []),
    targetStructure: helpers.compareTopologyAlternatives(currentTopology)[0] };
  session.regenerationPath = helpers.buildRegenerationPath(currentTopology, session.targetStructure, session.preserved);
  const saved = await store.transaction(db, async (tx) => {
    let baseline = await store.read(tx, { kind: 'topology', id: owner.id });
    if (!baseline) baseline = await store.write(tx, { kind: 'topology', id: owner.id, value: { topology: currentTopology } });
    if (store.hash(baseline.topology) !== store.hash(currentTopology)) throw store.error('AXOLOTL_BASELINE_MISMATCH');
    return store.write(tx, { kind: 'session', id: session.id, value: { ...session, baselineVersion: baseline.version } });
  });
  return { success: true, sessionId: saved.id, targetStructure: saved.targetStructure, regenerationPath: saved.regenerationPath,
    alternativesConsidered: 1, status: saved.status };
}

async function ownedSession(db, input) {
  const session = await store.read(db, { kind: 'session', id: input.sessionId });
  if (!session) throw store.error('AXOLOTL_SESSION_NOT_FOUND');
  if (input.orchestratorId !== session.orchestratorId) throw store.error('AXOLOTL_SESSION_ACCESS_DENIED');
  await store.assertOwner(db, input.orchestratorId);
  return session;
}

async function claim(db, input) {
  return store.transaction(db, async (tx) => {
    const session = await ownedSession(tx, input);
    const expired = session.status === 'executing' && Date.now() > session.deadline;
    const retryable = session.status === 'failed' && input.retry === true;
    if (session.status !== 'planned' && !expired && !retryable) throw store.error('REGENERATION_SESSION_NOT_PLANNED');
    await require('./axolotlTopologyService').assertMutable({ db: tx, orchestratorId: session.orchestratorId });
    const deadline = Date.now() + session.budget.durationMs * session.budget.experiments + 1000;
    return store.write(tx, { kind: 'session', id: session.id, expectedVersion: session.version,
      value: { ...session, status: 'executing', runId: crypto.randomUUID(), startedAt: Date.now(), deadline } });
  });
}

async function executeRegeneration({ sessionId, db, context = {} }) {
  const connection = resolveDb(db);
  const session = await claim(connection, { ...context, sessionId });
  try {
    const topology = helpers.buildScopedTopology(session);
    const result = await nursery.evaluate({ topology, contract: session.functionalContract, budget: session.budget });
    const cost = costs.accumulate(null, { ...costs.changes(session.currentTopology, topology), durationMs: Date.now() - session.startedAt, events: result.events });
    const evidence = { sessionId, subjectHash: store.hash(topology), contractHash: store.hash(session.functionalContract), runId: session.runId, result };
    return await finalize(connection, { session, topology, result, evidence, cost });
  } catch (failure) {
    await markFailed(connection, session, failure);
    return { success: false, sessionId, status: 'failed', code: failure.code || 'AXOLOTL_EXECUTION_FAILED', error: failure.message };
  }
}

async function finalize(db, execution) {
  const { session, topology, result, evidence, cost } = execution;
  return store.transaction(db, async (tx) => {
    const current = await ownedSession(tx, { sessionId: session.id, orchestratorId: session.orchestratorId });
    if (current.runId !== session.runId || current.status !== 'executing') throw store.error('AXOLOTL_EXECUTION_SUPERSEDED');
    const evidenceRef = await store.putEvidence(tx, evidence);
    let adoptedVersion = null;
    if (result.passed) {
      await require('./axolotlTopologyService').assertMutable({ db: tx, orchestratorId: session.orchestratorId });
      const adopted = await store.write(tx, { kind: 'topology', id: session.orchestratorId, expectedVersion: session.baselineVersion,
        value: { topology, sessionId: session.id, evidenceRef } });
      adoptedVersion = adopted.version;
    }
    const state = await store.write(tx, { kind: 'session', id: session.id, expectedVersion: current.version,
      value: { ...current, status: result.passed ? 'completed' : 'rejected', newTopology: topology,
        validation: result, evidenceRef, adoptedVersion, cost, completedAt: new Date().toISOString() } });
    return { success: result.passed, sessionId: session.id, status: state.status, newTopology: topology, validation: result, cost, evidenceRef };
  });
}

async function markFailed(db, session, failure) {
  return store.transaction(db, async (tx) => {
    const current = await store.read(tx, { kind: 'session', id: session.id });
    if (current.runId !== session.runId || current.status !== 'executing') return;
    await store.write(tx, { kind: 'session', id: current.id, expectedVersion: current.version,
      value: { ...current, status: 'failed', error: { code: failure.code, message: failure.message } } });
  });
}

async function rollbackRegeneration(input) {
  const db = resolveDb(input.db);
  return store.transaction(db, async (tx) => {
    const session = await ownedSession(tx, input);
    if (session.status !== 'completed') throw store.error('AXOLOTL_ROLLBACK_NOT_AVAILABLE');
    const active = await store.read(tx, { kind: 'topology', id: session.orchestratorId });
    if (active.version !== session.adoptedVersion) throw store.error('AXOLOTL_ROLLBACK_CONFLICT');
    await store.write(tx, { kind: 'topology', id: session.orchestratorId, expectedVersion: active.version,
      value: { topology: session.currentTopology, rollbackOf: session.id } });
    await store.write(tx, { kind: 'session', id: session.id, expectedVersion: session.version,
      value: { ...session, status: 'rolled_back', rollbackReason: input.reason, rolledBackAt: new Date().toISOString() } });
    return { success: true, sessionId: session.id, status: 'rolled_back' };
  });
}

async function getRegenerationSession(sessionId, input = {}) {
  if (!input.db && !database) return store.clone(legacySessions.get(sessionId) || null);
  return ownedSession(resolveDb(input.db), { ...input, sessionId });
}
async function listRegenerationSessions(input = {}) {
  const db = resolveDb(input.db);
  await store.assertOwner(db, input.orchestratorId);
  return (await store.list(db, 'session')).filter((item) => item.orchestratorId === input.orchestratorId);
}

async function prepareCognitiveLearning(sessionId, input) {
  return require('./axolotlCognitiveService').prepare({ ...input, sessionId, db: resolveDb(input.db) });
}
async function promoteCognitiveCandidate(input) {
  return require('./axolotlCognitiveService').promote({ ...input, db: resolveDb(input.db) });
}

module.exports = { assessRegenerationNeed, planRegeneration, executeRegeneration, rollbackRegeneration,
  getRegenerationSession, listRegenerationSessions, prepareCognitiveLearning, promoteCognitiveCandidate,
  setAdaptivePersister, setStateStore, ownedSession };
