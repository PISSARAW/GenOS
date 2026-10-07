'use strict';

const syncytium = require('../../syncytiumCoordinationService');

async function evaluate(db, sessionId, oracle) {
  if (!sessionId || !oracle || !Array.isArray(oracle.assertions) || !oracle.assertions.length) {
    return { measured: false, pass: false, checks: [], reason: 'missing_session_or_assertions' };
  }
  const snapshot = await syncytium.snapshot(sessionId, { db });
  const revisionRow = await db.get('SELECT revision FROM syncytium_session_revisions WHERE session_id = ?', sessionId);
  const revision = Number(revisionRow?.revision);
  const operations = await db.all('SELECT op_id, operation_json FROM syncytium_applied_ops WHERE session_id = ?', sessionId);
  const rejected = await rejectionRows(db, sessionId);
  const evidence = { snapshot, revision, operations: new Map(operations.map((row) => [row.op_id, parse(row.operation_json)])), rejected };
  const checks = oracle.assertions.map((assertion) => check(assertion, evidence));
  return { measured: true, pass: checks.every((item) => item.pass), checks,
    sessionId, revision };
}

async function rejectionRows(db, sessionId) {
  const exists = await db.get("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'syncytium_rejection_receipts'");
  if (!exists) return [];
  return db.all('SELECT id, action, code, op_id, caller_id FROM syncytium_rejection_receipts WHERE session_id = ?', sessionId);
}

function checkOperationPresence(assertion, evidence) {
  if (typeof assertion.opId !== 'string' || !assertion.opId) {
    return { assertion, pass: false, reason: 'missing_operation_id' };
  }
  const present = evidence.operations.has(assertion.opId);
  const actorMatches = !assertion.actorId || evidence.operations.get(assertion.opId)?.actorId === assertion.actorId;
  return checkResult({ assertion, kind: assertion.kind, present, actorMatches });
}

function checkOperationRejected(assertion, evidence) {
  if (!assertion.opId || !assertion.code) return { assertion, pass: false, reason: 'missing_rejection_identity' };
  const receipt = evidence.rejected.find((row) => checkCondition(row, assertion));
  return { assertion, pass: Boolean(receipt), receipt: receipt?.id || null };
}

function check(assertion, evidence) {
  const kind = assertion?.kind;
  if (kind === 'operation_applied' || kind === 'operation_absent') {
    return checkOperationPresence(assertion, evidence);
  }
  if (kind === 'operation_rejected') {
    return checkOperationRejected(assertion, evidence);
  }
  if (kind === 'state') return stateCheck(assertion, evidence.snapshot);
  if (kind === 'revision_at_least') {
    return checkResult2(assertion, evidence.revision);
  }
  return { assertion, pass: false, reason: 'unknown_assertion_kind' };
}

function applyStateOperator(operator, actual, assertion) {
  if (operator === 'equals') return JSON.stringify(actual) === JSON.stringify(assertion.value);
  if (operator === 'absent') return actual === undefined || actual === null;
  if (operator === 'count') return (stateCheckCondition(actual)) === assertion.value;
  if (operator === 'contains') return Array.isArray(actual) && actual.some((item) => JSON.stringify(item) === JSON.stringify(assertion.value));
  return false;
}

function stateCheck(assertion, snapshot) {
  if (!Array.isArray(assertion.path) || assertion.path.length < 1) {
    return { assertion, pass: false, reason: 'invalid_path' };
  }
  const actual = assertion.path.reduce((value, key) => value?.[key], snapshot);
  const pass = applyStateOperator(assertion.operator || 'equals', actual, assertion);
  return { assertion, pass, actual: actual === undefined ? null : actual };
}

function parse(serialized) {
  try { return JSON.parse(serialized || '{}'); } catch { return {}; }
}

module.exports = { evaluate };

function checkCondition(row, assertion) {
  return row.op_id === assertion.opId
      && row.code === assertion.code && (!assertion.action || row.action === assertion.action)
      && (!assertion.callerId || row.caller_id === assertion.callerId);
}

function stateCheckCondition(actual) {
  return Array.isArray(actual) ? actual.length : Object.keys(actual || {}).length;
}

function checkResult({ assertion, kind, present, actorMatches }) {
  return { assertion, pass: kind === 'operation_applied' ? present && actorMatches : !present,
      receipt: present ? assertion.opId : null };
}

function checkResult2(assertion, revision) {
  return { assertion, pass: Number.isSafeInteger(revision)
      && Number.isSafeInteger(assertion.value) && revision >= assertion.value, receipt: revision };
}
