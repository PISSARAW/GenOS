'use strict';

const { createSyncytiumCrdt } = require('../../syncytiumCrdtService');
const authority = require('../security/mutationAuthorityService');
const classifier = require('../consistency/operationClassifier');
const zones = require('../consistency/consistencyZoneService');
const conflicts = require('../conflicts/semanticConflictService');
const invariantEvaluator = require('../invariants/invariantEvaluator');
const router = require('../consistency/coordinationRouter');
const schemaService = require('../../syncytiumSchemaService');
const deltaRouter = require('../sync/deltaRouter');
const projectionMaterializer = require('../sync/projectionMaterializer');
const adaptiveSync = require('../sync/adaptiveSyncService');

async function apply(context) {
  validateTransaction(context.transaction);
  return router.run({ coordinationRequired: true }, context.sessionId, async () => {
    const session = await context.getSession(context.sessionId, context.options.db);
    validateConsumerDomain(session, context.options.domainId);
    return execute({ ...context, session });
  });
}

async function execute(context) {
  const { transaction, session } = context;
  const history = session.crdt.getHistory();
  const duplicate = duplicateStatus(history, transaction);
  if (duplicate === 'ALL') return duplicateResult(context);
  if (duplicate === 'PARTIAL') throw transactionError('SYNCYTIUM_TRANSACTION_PARTIAL_DUPLICATE', 'Only part of this transaction was already applied.');
  checkPreconditions(transaction.preconditions, session.crdt.getSnapshot(), history.length);
  validateInvariantSelection(transaction.invariants, session.schema?.invariants || {});
  const candidate = replay(history);
  const accepted = applyOperations({ ...context, candidate });
  const receipts = evaluateInvariants(session.schema, candidate);
  validateReceipts(receipts);
  return persistCandidate({ ...context, candidate, accepted, receipts });
}

function validateTransaction(transaction) {
  requireTransactionId(transaction);
  requireOperations(transaction);
  validateOptionalList(transaction.preconditions, 'preconditions');
  validateOptionalList(transaction.invariants, 'invariants');
  validateCommitPolicy(transaction.commitPolicy);
  const ids = transaction.operations.map((operation) => operation?.opId);
  if (ids.some((id) => typeof id !== 'string' || !id.trim()) || new Set(ids).size !== ids.length) throw transactionError('SYNCYTIUM_TRANSACTION_INVALID', 'Transaction operations require unique opIds.');
}

function requireTransactionId(transaction) {
  if (!transaction?.txId || typeof transaction.txId !== 'string' || !transaction.txId.trim()) throw transactionError('SYNCYTIUM_TRANSACTION_INVALID', 'Transaction requires a txId.');
}

function requireOperations(transaction) {
  if (!Array.isArray(transaction.operations) || !transaction.operations.length) throw transactionError('SYNCYTIUM_TRANSACTION_INVALID', 'Transaction requires at least one operation.');
}

function validateOptionalList(value, name) {
  if (value !== undefined && !Array.isArray(value)) throw transactionError('SYNCYTIUM_TRANSACTION_INVALID', `Transaction ${name} must be a list.`);
}

function validateCommitPolicy(policy) {
  if (policy && !['SERIALIZABLE', 'ALL_OR_NOTHING'].includes(policy)) throw transactionError('SYNCYTIUM_TRANSACTION_INVALID', 'Transaction commitPolicy must be SERIALIZABLE or ALL_OR_NOTHING.');
}

function duplicateStatus(history, transaction) {
  const known = new Map(history.filter((item) => item.opId).map((item) => [item.opId, item]));
  const existing = transaction.operations.map((operation) => known.get(operation.opId));
  if (existing.every((item) => item?.transactionId === transaction.txId)) return 'ALL';
  if (existing.some(Boolean)) return 'PARTIAL';
  return 'NONE';
}

function duplicateResult({ sessionId, session, transaction, options }) {
  const snapshot = session.crdt.getSnapshot();
  const domain = options.domainId ? session.domains[options.domainId] : null;
  return {
    sessionId,
    txId: transaction.txId,
    duplicate: true,
    snapshot: domain ? projectionMaterializer.projectSnapshot({ snapshot, schema: session.schema, domain }) : snapshot,
    operationIds: transaction.operations.map((item) => item.opId)
  };
}

function validateConsumerDomain(session, domainId) {
  if (domainId && !session.domains[domainId]) {
    throw transactionError('SYNCYTIUM_DOMAIN_UNKNOWN', `Unknown Syncytium domain '${domainId}'.`);
  }
}

function checkPreconditions(preconditions = [], snapshot, stateVersion) {
  for (const precondition of preconditions) {
    if (!preconditionPasses(precondition, snapshot.sharedFields, stateVersion)) {
      throw transactionError('SYNCYTIUM_PRECONDITION_FAILED', `Transaction precondition failed for '${precondition.path || precondition.op}'.`);
    }
  }
}

function preconditionPasses(precondition, state, stateVersion) {
  if (precondition.op === 'state_version') return precondition.value === stateVersion;
  const actual = readValue(state, precondition.path);
  const checks = {
    equals: () => actual === precondition.value,
    not_equals: () => actual !== precondition.value,
    present: () => actual !== undefined && actual !== null,
    min: () => Number.isFinite(actual) && actual >= precondition.value,
    max: () => Number.isFinite(actual) && actual <= precondition.value
  };
  return Boolean(checks[precondition.op]?.());
}

function readValue(state, path) {
  if (Object.hasOwn(state, path)) return state[path];
  return String(path || '').split('.').filter(Boolean).reduce((value, key) => value?.[key], state);
}

function validateInvariantSelection(ids, registry) {
  for (const id of ids || []) {
    if (!registry[id]) throw transactionError('SYNCYTIUM_TRANSACTION_INVALID', `Unknown invariant '${id}'.`);
  }
}

function replay(history) {
  const candidate = createSyncytiumCrdt();
  history.forEach((operation) => candidate.applyOp(operation));
  return candidate;
}

function applyOperations(context) {
  const accepted = [];
  for (const rawOperation of context.transaction.operations) {
    accepted.push(admitAndApply(context, rawOperation));
  }
  return accepted;
}

function admitAndApply(context, rawOperation) {
  const admission = schemaService.admitOperation(context.session.schema, rawOperation);
  const operation = admission.operation;
  if (!['set_field', 'typed_field'].includes(operation.kind?.type)) {
    throw transactionError('SYNCYTIUM_TRANSACTION_INVALID', 'Transactions accept shared field writes only.');
  }
  authority.authorize(context.session.domains, context.session.schema, operation);
  const decision = classifier.classify(context.session.schema, operation);
  zones.validateMutation(decision.zone, operation, context.candidate.getSnapshot().sharedFields);
  conflicts.assertNoBlockingConflicts({
    operation, history: context.candidate.getHistory(), schema: context.session.schema, domains: context.session.domains
  });
  const accepted = { ...operation, transactionId: context.transaction.txId };
  context.candidate.applyOp(accepted);
  return accepted;
}

function evaluateInvariants(schema, candidate) {
  return invariantEvaluator.evaluateAll(schema?.invariants || {}, candidate.getSnapshot().sharedFields);
}

function validateReceipts(receipts) {
  const violations = receipts.filter((receipt) => !receipt.passed && receipt.severity !== 'WARNING');
  if (violations.length) {
    throw Object.assign(new Error('Transaction would violate a blocking invariant.'), {
      code: 'SYNCYTIUM_INVARIANT_VIOLATION', violations
    });
  }
}

async function persistCandidate(context) {
  const { session, candidate, accepted, persist, transaction, sessionId, receipts } = context;
  const previous = session.crdt;
  session.crdt = candidate;
  session.pendingOperations = accepted;
  try {
    await persist(session);
  } catch (error) {
    session.crdt = previous;
    session.pendingOperations = null;
    throw error;
  }
  const projected = context.options.domainId ? projectionMaterializer.projectSnapshot({
    snapshot: candidate.getSnapshot(),
    schema: session.schema,
    domain: session.domains[context.options.domainId]
  }) : candidate.getSnapshot();
  const deltas = accepted.map((operation) => ({
    opId: operation.opId,
    recipients: deltaRouter.route({ operation, schema: session.schema, domains: session.domains }),
    plan: adaptiveSync.plan({
      operation, schema: session.schema, domains: session.domains,
      telemetry: context.options.syncTelemetry || {},
      coordination: { classification: 'RED' }
    })
  }));
  return {
    sessionId,
    txId: transaction.txId,
    snapshot: projected,
    operationIds: accepted.map((item) => item.opId),
    invariants: receipts,
    coordination: { zone: 'SERIALIZABLE', classification: 'RED', coordinationRequired: true },
    deltas
  };
}

function transactionError(code, message) {
  return Object.assign(new Error(message), { code });
}

module.exports = { apply };
