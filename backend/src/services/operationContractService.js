'use strict';

const SCHEMA_VERSION = '1.0.0';
const TERMINAL_STATES = Object.freeze(['complete', 'partial', 'unavailable', 'failed']);
const OPERATION_KINDS = Object.freeze(['signal', 'workflow', 'perception', 'topology', 'trinity']);
const ORIGINS = Object.freeze(['simulated', 'local', 'external']);
const VERSION_PATTERN = /^[0-9]+\.[0-9]+\.[0-9]+$/;

const TRANSITIONS = Object.freeze({
  pending: ['running', 'failed', 'unavailable'],
  running: ['complete', 'partial', 'unavailable', 'failed'],
  partial: ['running', 'complete', 'failed'],
  unavailable: ['running', 'failed'],
  failed: ['running'],
  complete: []
});

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && Array.isArray(value) === false;
}

function nonEmpty(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function fail(message, path) {
  return { message, path: path || '' };
}

function ok() {
  return { valid: true, errors: [] };
}

function invalid(errors) {
  return { valid: false, errors };
}

function checkVersion(value, errors) {
  if (typeof value !== 'string') errors.push(fail('schemaVersion must be a string', 'schemaVersion'));
  if (typeof value === 'string') {
    if (VERSION_PATTERN.test(value) === false) errors.push(fail('schemaVersion must match X.Y.Z', 'schemaVersion'));
  }
}

function checkIds(correlation, fields, errors) {
  for (const field of fields) {
    if (nonEmpty(correlation[field]) === false) errors.push(fail(`${field} is required`, field));
  }
}

function validateCorrelation(correlation) {
  const errors = [];
  if (isRecord(correlation) === false) return invalid([fail('correlation must be an object', 'correlation')]);
  checkIds(correlation, ['missionId', 'runId', 'operationId', 'eventId'], errors);
  checkIdsOptional(correlation, errors);
  if (errors.length > 0) return invalid(errors);
  return ok();
}

function checkIdsOptional(correlation, errors) {
  for (const field of ['branchId', 'agentId', 'proofId']) {
    if (correlation[field] !== undefined) {
      if (nonEmpty(correlation[field]) === false) errors.push(fail(`${field} must be non-empty`, field));
    }
  }
}

function validateBudget(budget) {
  const errors = [];
  if (isRecord(budget) === false) return invalid([fail('budget must be an object', 'budget')]);
  if (typeof budget.durationMs !== 'number') errors.push(fail('durationMs is required', 'durationMs'));
  if (typeof budget.maxCost !== 'number') errors.push(fail('maxCost is required', 'maxCost'));
  if (Number.isInteger(budget.maxSteps) === false) errors.push(fail('maxSteps must be an integer', 'maxSteps'));
  if (errors.length > 0) return invalid(errors);
  return ok();
}

function validateOperation(operation) {
  const errors = [];
  if (isRecord(operation) === false) return invalid([fail('operation must be an object', 'operation')]);
  checkVersion(operation.schemaVersion, errors);
  if (OPERATION_KINDS.includes(operation.operationKind) === false) errors.push(fail('unknown operationKind', 'operationKind'));
  if (nonEmpty(operation.idempotencyKey) === false) errors.push(fail('idempotencyKey is required', 'idempotencyKey'));
  collectOperationErrors(operation, errors);
  if (errors.length > 0) return invalid(errors);
  return ok();
}

function collectOperationErrors(operation, errors) {
  const correlation = validateCorrelation(operation.correlation || {});
  if (correlation.valid === false) errors.push(...correlation.errors);
  const budget = validateBudget(operation.budget || {});
  if (budget.valid === false) errors.push(...budget.errors);
  if (isRecord(operation.authority) === false) errors.push(fail('authority is required', 'authority'));
  if (isRecord(operation.authority)) {
    if (nonEmpty(operation.authority.requester) === false) errors.push(fail('authority.requester is required', 'authority'));
  }
}

function validateReceipt(receipt) {
  const errors = [];
  if (isRecord(receipt) === false) return invalid([fail('receipt must be an object', 'receipt')]);
  checkVersion(receipt.schemaVersion, errors);
  if (TERMINAL_STATES.includes(receipt.status) === false) errors.push(fail('unknown status', 'status'));
  if (ORIGINS.includes(receipt.origin) === false) errors.push(fail('unknown origin', 'origin'));
  if (nonEmpty(receipt.idempotencyKey) === false) errors.push(fail('idempotencyKey is required', 'idempotencyKey'));
  checkReceiptReason(receipt, errors);
  checkReceiptBodies(receipt, errors);
  const correlation = validateCorrelation(receipt.correlation || {});
  if (correlation.valid === false) errors.push(...correlation.errors);
  if (errors.length > 0) return invalid(errors);
  return ok();
}

function checkReceiptReason(receipt, errors) {
  if (receipt.status !== 'complete') {
    if (nonEmpty(receipt.reason) === false) errors.push(fail('reason is required unless complete', 'reason'));
  }
}

function checkReceiptBodies(receipt, errors) {
  for (const field of ['observed', 'requested', 'result']) {
    if (isRecord(receipt[field]) === false) errors.push(fail(`${field} must be an object`, field));
  }
}

function validateEvidence(evidence) {
  const errors = [];
  if (isRecord(evidence) === false) return invalid([fail('evidence must be an object', 'evidence')]);
  checkVersion(evidence.schemaVersion, errors);
  if (nonEmpty(evidence.proofId) === false) errors.push(fail('proofId is required', 'proofId'));
  const correlation = validateCorrelation(evidence.correlation || {});
  if (correlation.valid === false) errors.push(...correlation.errors);
  checkDimensions(evidence.dimensions, errors);
  if (errors.length > 0) return invalid(errors);
  return ok();
}

function checkDimensions(dimensions, errors) {
  if (Array.isArray(dimensions) === false) errors.push(fail('dimensions must be a list', 'dimensions'));
  if (Array.isArray(dimensions)) {
    if (dimensions.length === 0) errors.push(fail('dimensions must not be empty', 'dimensions'));
  }
  if (Array.isArray(dimensions)) {
    for (const dimension of dimensions) checkDimension(dimension, errors);
  }
}

function checkDimension(dimension, errors) {
  if (isRecord(dimension) === false) errors.push(fail('dimension must be an object', 'dimensions'));
  if (isRecord(dimension)) {
    if (nonEmpty(dimension.name) === false) errors.push(fail('dimension.name is required', 'dimensions'));
    if (nonEmpty(dimension.provenance) === false) errors.push(fail('dimension.provenance is required', 'dimensions'));
  }
}

function isAllowedTransition(from, to) {
  const allowed = TRANSITIONS[from];
  if (allowed === undefined) return false;
  return allowed.includes(to);
}

function buildReceipt(operation, outcome) {
  const operationCheck = validateOperation(operation);
  if (operationCheck.valid === false) throw invalidOperationError(operationCheck.errors);
  const outcomeCheck = validateReceiptOutcome(outcome);
  if (outcomeCheck.valid === false) throw invalidOperationError(outcomeCheck.errors);
  return Object.freeze({
    schemaVersion: SCHEMA_VERSION,
    correlation: structuredClone(operation.correlation),
    idempotencyKey: operation.idempotencyKey,
    status: outcome.status,
    reason: outcome.reason || '',
    origin: outcome.origin,
    observed: structuredClone(outcome.observed || {}),
    requested: structuredClone(outcome.requested || {}),
    result: structuredClone(outcome.result || {}),
    proofIds: Array.isArray(outcome.proofIds) ? [...outcome.proofIds] : [],
    issuedAt: new Date().toISOString()
  });
}

function validateReceiptOutcome(outcome) {
  const errors = [];
  if (isRecord(outcome) === false) return invalid([fail('outcome must be an object', 'outcome')]);
  if (TERMINAL_STATES.includes(outcome.status) === false) errors.push(fail('unknown status', 'status'));
  if (ORIGINS.includes(outcome.origin) === false) errors.push(fail('unknown origin', 'origin'));
  if (errors.length > 0) return invalid(errors);
  return ok();
}

function invalidOperationError(errors) {
  const exception = new Error('Invalid operation contract');
  exception.code = 'INVALID_OPERATION_CONTRACT';
  exception.errors = errors;
  return exception;
}

function lineageKey(correlation) {
  const check = validateCorrelation(correlation);
  if (check.valid === false) throw invalidOperationError(check.errors);
  return [correlation.missionId, correlation.runId, correlation.operationId, correlation.eventId].join('/');
}

module.exports = {
  SCHEMA_VERSION,
  TERMINAL_STATES,
  OPERATION_KINDS,
  ORIGINS,
  TRANSITIONS,
  validateCorrelation,
  validateBudget,
  validateOperation,
  validateReceipt,
  validateEvidence,
  isAllowedTransition,
  buildReceipt,
  lineageKey
};
