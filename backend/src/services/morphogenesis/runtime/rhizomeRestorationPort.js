'use strict';

const { fingerprint } = require('../../stateFingerprint');
const { createTopologyRuntimePort } = require('./topologyRuntimePort');

const STATE_SCHEMA = 'genos.rhizome-restoration-state/v1';
const PLAN_SCHEMA = 'genos.rhizome-controlled-adaptation/v1';
const PORT_CAPABILITIES = Object.freeze({ observe: 'verified', quiesce: 'verified',
  snapshot: 'verified', adapt: 'verified', restore: 'verified', finalize: 'verified' });
const QUIESCENT = new Set(['DORMANT', 'QUARANTINED']);
const SESSION_BOUND_VARIANTS = new Set([
  'persistent', 'ephemeral', 'private', 'cross_representation', 'procedural'
]);
const CHANGE_KEYS = new Set([
  'variant', 'branches', 'operations', 'leases', 'checkpoints', 'resources', 'externalBindings'
]);

function createRhizomeRestorationPort(input = {}) {
  validateDependencies(input);
  const transactions = new Map();
  return createTopologyRuntimePort({ topology: 'rhizome', executionKind: 'canonical_service',
    morphogenesis: PORT_CAPABILITIES, lifecycle: lifecycle(input, transactions),
    execute: input.execute || forbiddenExecution });
}

function createRhizomeRestorationVerifier(input = {}) {
  if (!text(input.verifierId) || typeof input.reader?.read !== 'function') {
    throw coded('RHIZOME_RESTORATION_VERIFIER_INVALID',
      'An identified independent Rhizome state reader is required.');
  }
  return async function verify(request) {
    const sessionId = request.snapshot?.provenance?.sessionId;
    const observed = normalizeRecord(await input.reader.read(sessionId));
    const observedHash = fingerprint(observed.state);
    const expectedHash = request.stage === 'restored'
      ? request.snapshot?.hash : request.adaptation?.stateHash;
    return { verified: observedHash === expectedHash, verifierId: input.verifierId,
      observedHash, expectedHash, stage: request.stage,
      evidenceRefs: [`rhizome-state://${sessionId}/${observed.recordRevision}/${observedHash}`] };
  };
}

function validateDependencies(input) {
  const methods = ['read', 'quiesce', 'adapt', 'replace', 'finalize'];
  if (input.qualificationOnly !== true) {
    throw coded('RHIZOME_RESTORATION_PRODUCTION_FORBIDDEN',
      'The Rhizome restoration port is restricted to qualification runs.');
  }
  if (!text(input.producerId) || methods.some((name) => typeof input.store?.[name] !== 'function')) {
    throw coded('RHIZOME_RESTORATION_STORE_INVALID',
      'Rhizome restoration requires an identified producer and a complete injected store.');
  }
}

function lifecycle(input, transactions) {
  return {
    observe: (request) => observe(input, transactions, request),
    quiesce: (request) => quiesce(input, transactions, request),
    snapshot: (request) => snapshot(input, transactions, request),
    adapt: (request) => adapt(input, transactions, request),
    restore: (request) => restore(input, transactions, request),
    finalize: (request) => finalize(input, transactions, request)
  };
}

async function observe(input, transactions, request) {
  assertProducer(input, request);
  const record = normalizeRecord(await input.store.read(sessionId(request)));
  transactions.set(request.transitionId, { sessionId: record.state.sessionId });
  return { observed: true, recordRevision: record.recordRevision,
    stateHash: fingerprint(record.state), productionAuthorized: false };
}

async function quiesce(input, transactions, request) {
  const transaction = transactionFor(transactions, request);
  const before = normalizeRecord(await input.store.read(transaction.sessionId));
  assertNoActiveWork(before.state, nowValue(input));
  const receipt = await input.store.quiesce({ sessionId: transaction.sessionId,
    transitionId: request.transitionId });
  if (receipt?.quiescent !== true || !text(receipt.token)) {
    throw coded('RHIZOME_RESTORATION_QUIESCE_FAILED',
      'Rhizome store did not return a durable quiescence token.');
  }
  const record = normalizeRecord(await input.store.read(transaction.sessionId));
  assertQuiescent(record.state, nowValue(input));
  if (record.state.variant.id === 'ephemeral') {
    throw coded('RHIZOME_RESTORATION_EPHEMERAL_UNSUPPORTED',
      'Ephemeral Rhizome sessions cannot produce restorable checkpoints.');
  }
  Object.assign(transaction, { token: receipt.token, checkpointId: receipt.checkpointId });
  return { quiescent: true, token: receipt.token, checkpointId: receipt.checkpointId,
    recordRevision: record.recordRevision, productionAuthorized: false };
}

async function snapshot(input, transactions, request) {
  const transaction = transactionFor(transactions, request);
  if (!transaction.token) throw coded('RHIZOME_RESTORATION_NOT_QUIESCENT',
    'A durable quiescence token is required before snapshot.');
  const record = normalizeRecord(await input.store.read(transaction.sessionId));
  assertQuiescent(record.state, nowValue(input));
  const hash = fingerprint(record.state);
  const provenance = { sessionId: record.state.sessionId, missionId: record.state.missionId,
    recordRevision: record.recordRevision, checkpointId: transaction.checkpointId,
    capturedAt: new Date(nowValue(input)).toISOString(), producerId: input.producerId };
  return { restorable: true, snapshotId: fingerprint({ hash, provenance }),
    producerId: input.producerId, version: 1, state: record.state, hash, provenance,
    productionAuthorized: false };
}

async function adapt(input, transactions, request) {
  const transaction = transactionFor(transactions, request);
  const plan = controlledPlan(request.plan?.rhizome, request.snapshot, transaction.sessionId);
  await input.store.adapt({ sessionId: transaction.sessionId, transitionId: request.transitionId,
    expectedRecordRevision: request.snapshot.provenance.recordRevision, plan });
  if (request.context?.crashAfterAdapt) {
    throw coded('RHIZOME_SIMULATED_POST_ADAPT_CRASH', 'Simulated crash after Rhizome adaptation.');
  }
  const record = normalizeRecord(await input.store.read(transaction.sessionId));
  return { applied: true, operationId: plan.operationId, checkpointId: plan.checkpointId,
    recordRevision: record.recordRevision, stateHash: fingerprint(record.state),
    productionAuthorized: false };
}

async function restore(input, transactions, request) {
  const transaction = transactionFor(transactions, request);
  assertSnapshotForSession(request.snapshot, transaction.sessionId);
  let record = normalizeRecord(await input.store.read(transaction.sessionId));
  if (fingerprint(record.state) !== request.snapshot.hash) {
    await input.store.replace({ sessionId: transaction.sessionId,
      expectedRecordRevision: record.recordRevision, state: request.snapshot.state,
      restoreKey: `${request.transitionId}:${request.snapshot.snapshotId}` });
    record = normalizeRecord(await input.store.read(transaction.sessionId));
  }
  const restored = fingerprint(record.state) === request.snapshot.hash;
  return { restored, idempotent: restored, snapshotId: request.snapshot.snapshotId,
    hash: request.snapshot.hash, recordRevision: record.recordRevision,
    productionAuthorized: false };
}

async function finalize(input, transactions, request) {
  const transaction = transactions.get(request.transitionId);
  const session = transaction?.sessionId || request.snapshot?.provenance?.sessionId;
  const receipt = await input.store.finalize({ sessionId: session,
    transitionId: request.transitionId, token: transaction?.token || null });
  transactions.delete(request.transitionId);
  return { finalized: receipt?.finalized === true, productionAuthorized: false };
}

function controlledPlan(plan, snapshotValue, session) {
  const changes = object(plan?.changes);
  const valid = validPlanEnvelope(plan, snapshotValue, session)
    && validChanges(changes, snapshotValue);
  if (!valid) throw coded('RHIZOME_RESTORATION_PLAN_INVALID',
    'Rhizome adaptation must be qualification-only, snapshot-bound and allowlisted.');
  return structuredClone(plan);
}

function validPlanEnvelope(plan, snapshotValue, session) {
  return [plan?.schema === PLAN_SCHEMA, plan?.sessionId === session,
    plan?.expectedSnapshotHash === snapshotValue?.hash, plan?.production === false,
    text(plan?.operationId), text(plan?.checkpointId)].every(Boolean);
}

function validChanges(changes, snapshotValue) {
  const keys = Object.keys(changes);
  const targetVariant = changes.variant?.id;
  const priorVariant = snapshotValue?.state?.variant?.id;
  const changing = targetVariant !== priorVariant;
  const forbidden = changing
    && (SESSION_BOUND_VARIANTS.has(targetVariant) || SESSION_BOUND_VARIANTS.has(priorVariant));
  return keys.length > 0 && !forbidden && keys.every((key) => CHANGE_KEYS.has(key));
}

function normalizeRecord(value) {
  if (!Number.isSafeInteger(value?.recordRevision) || value.recordRevision < 0) {
    throw coded('RHIZOME_RESTORATION_RECORD_INVALID', 'Rhizome record revision is invalid.');
  }
  return { recordRevision: value.recordRevision, state: normalizeState(value.state) };
}

function normalizeState(value) {
  const state = object(value);
  const valid = state.schema === STATE_SCHEMA && text(state.sessionId) && text(state.missionId)
    && (QUIESCENT.has(state.status) || state.status === 'ACTIVE');
  if (!valid) throw coded('RHIZOME_RESTORATION_STATE_INVALID', 'Rhizome state identity is invalid.');
  return { schema: STATE_SCHEMA, sessionId: state.sessionId, missionId: state.missionId,
    status: state.status, variant: requiredObject(state.variant, 'variant'),
    branches: requiredObject(state.branches, 'branches'),
    operations: requiredObject(state.operations, 'operations'),
    leases: requiredObject(state.leases, 'leases'),
    checkpoints: requiredObject(state.checkpoints, 'checkpoints'),
    resources: requiredObject(state.resources, 'resources'),
    externalBindings: requiredArray(state.externalBindings, 'externalBindings') };
}

function assertQuiescent(state, now) {
  assertNoActiveWork(state, now);
  if (!QUIESCENT.has(state.status)) {
    throw coded('RHIZOME_RESTORATION_NOT_QUIESCENT',
      'Rhizome snapshot requires a dormant or quarantined session.');
  }
}

function assertNoActiveWork(state, now) {
  const activeOperations = requiredArray(state.operations.inFlight, 'operations.inFlight');
  const branchLeases = requiredArray(state.leases.branches, 'leases.branches');
  const coordination = requiredArray(state.leases.coordination, 'leases.coordination');
  const activeBranch = branchLeases.some((lease) => lease.status !== 'revoked'
    && Date.parse(lease.expiresAt) > now);
  const activeCoordination = coordination.some((lease) => lease.status !== 'revoked'
    && Date.parse(lease.leaseUntil) > now);
  if (activeOperations.length || activeBranch || activeCoordination) {
    throw coded('RHIZOME_RESTORATION_NOT_QUIESCENT',
      'Rhizome snapshot requires no active operations or leases.');
  }
}

function assertProducer(input, request) {
  if (request.producerId !== input.producerId) throw coded('RHIZOME_RESTORATION_PRODUCER_MISMATCH',
    'Rhizome snapshot producer does not match the injected port identity.');
}

function assertSnapshotForSession(snapshotValue, session) {
  if (snapshotValue?.provenance?.sessionId !== session
    || fingerprint(snapshotValue.state) !== snapshotValue.hash) {
    throw coded('RHIZOME_RESTORATION_SNAPSHOT_INVALID',
      'Rhizome restore snapshot is altered or belongs to another session.');
  }
}

function transactionFor(transactions, request) {
  const transaction = transactions.get(request.transitionId);
  if (!transaction) throw coded('RHIZOME_RESTORATION_TRANSACTION_UNKNOWN',
    'Rhizome restoration transaction was not observed.');
  return transaction;
}

function sessionId(request) {
  const value = request.context?.sessionId || request.plan?.rhizome?.sessionId;
  if (!text(value)) throw coded('RHIZOME_RESTORATION_SESSION_REQUIRED',
    'Rhizome restoration requires a session identifier.');
  return value;
}

function requiredObject(value, field) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw coded('RHIZOME_RESTORATION_STATE_INVALID', `Rhizome ${field} must be an object.`);
  }
  return structuredClone(value);
}

function requiredArray(value, field) {
  if (!Array.isArray(value)) throw coded('RHIZOME_RESTORATION_STATE_INVALID',
    `Rhizome ${field} must be an array.`);
  return structuredClone(value);
}

function nowValue(input) { return typeof input.now === 'function' ? input.now() : Date.now(); }
function object(value) { return value && typeof value === 'object' && !Array.isArray(value) ? value : {}; }
function text(value) { return typeof value === 'string' && value.trim().length > 0; }
function coded(code, message) { return Object.assign(new Error(message), { code }); }
function forbiddenExecution() { throw coded('RHIZOME_RESTORATION_EXECUTION_FORBIDDEN',
  'The qualification-only restoration port cannot execute production missions.'); }

module.exports = { PLAN_SCHEMA, STATE_SCHEMA, createRhizomeRestorationPort,
  createRhizomeRestorationVerifier, normalizeState };
