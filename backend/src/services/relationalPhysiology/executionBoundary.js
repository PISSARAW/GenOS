'use strict';

const { getDatabase, withTransaction } = require('../../db');
const { digest } = require('./index');
const { runGuarded } = require('./runtimeBoundary');
const { loadProjection, authorizationFor } = require('./executionProjection');
const { admitSignal } = require('./executionSignal');

function requestFrom(input) {
  const { scope, actorId, communication } = input;
  if (!scope || !actorId || !communication) throw new Error('RPE_EXECUTION_INPUT_REQUIRED');
  return {
    kind: 'communicate', scope: {
      organizationId: scope.organizationId, projectId: scope.projectId
    },
    actorId, operationId: communication.operationId,
    receiverId: communication.receiverId, refs: communication.refs,
    event: communication.event || 'information', blind: communication.blind === true,
    expectedRevision: communication.expectedRevision
  };
}

async function priorResult(db, request, requestHash) {
  const row = await db.get(
    `SELECT request_hash, result_json FROM rpe_execution_decisions
      WHERE organization_id = ? AND project_id = ? AND operation_id = ?`,
    [request.scope.organizationId, request.scope.projectId, request.operationId]
  );
  if (!row) return null;
  if (row.request_hash !== requestHash) throw new Error('RPE_OPERATION_ID_CONFLICT');
  if (!row.result_json) throw new Error('RPE_INCOMPLETE_ADMISSION');
  return JSON.parse(row.result_json);
}

async function recordDecision(input) {
  const { db, request, decision, requestHash } = input;
  await db.run(
    `INSERT INTO rpe_execution_decisions
     (organization_id, project_id, operation_id, request_hash, receipt_json, status)
     VALUES (?, ?, ?, ?, ?, 'evaluated')`,
    [request.scope.organizationId, request.scope.projectId, request.operationId,
      requestHash, JSON.stringify(decision)]
  );
}

async function finishDecision(db, request, result) {
  const status = result.status === 'executed' ? 'admitted' : result.status;
  await db.run(
    `UPDATE rpe_execution_decisions SET status = ?, result_json = ?
      WHERE organization_id = ? AND project_id = ? AND operation_id = ?`,
    [status, JSON.stringify(result), request.scope.organizationId,
      request.scope.projectId, request.operationId]
  );
}

async function runWithinTransaction(db, request, requestHash) {
  const at = Date.now();
  const projection = await loadProjection(db, { ...request, at });
  if (request.expectedRevision === undefined) request.expectedRevision = projection.context.revision;
  const ports = {
    withBoundary: async (_operationId, task) => task(),
    now: () => Date.now(),
    loadContext: async () => projection.context,
    authorize: async (timed) => authorizationFor(projection, timed),
    recordDecision: async (decision) => recordDecision({ db, request, decision, requestHash }),
    execute: async ({ plan, planHash }) => {
      if (Date.now() >= projection.grant.valid_until_ms) {
        throw new Error('RPE_AUTHORIZATION_EXPIRED_BEFORE_ADMISSION');
      }
      return admitSignal(db, { plan, planHash, at: Date.now() });
    }
  };
  const result = await runGuarded(request, ports);
  await finishDecision(db, request, result);
  return result;
}

async function publishGuardedReferences(input) {
  const db = input.db || await getDatabase();
  if (typeof db.exec !== 'function') throw new Error('RPE_TRANSACTION_REQUIRED');
  const request = requestFrom(input);
  const requestHash = digest({ ...request, expectedRevision: request.expectedRevision ?? null });
  return withTransaction(db, async (tx) => {
    const prior = await priorResult(tx, request, requestHash);
    if (prior) return prior;
    return runWithinTransaction(tx, request, requestHash);
  });
}

module.exports = { publishGuardedReferences };
