'use strict';

const { randomUUID } = require('crypto');
const { withTransaction } = require('../../../db');
const statisticalReceipt = require('./statisticalReceipt');

async function audit(db, event) {
  await db.run(`INSERT INTO morph_risk_events (event_id, root_id, event_kind, payload_json)
    VALUES (?, ?, ?, ?)`, [randomUUID(), event.rootId, event.kind, JSON.stringify(event.payload)]);
}

function positiveUnits(value) {
  if (!Number.isSafeInteger(value) || value <= 0 || value > 1000000000) {
    throw new Error('Risk units must be an integer in (0, 1e9]');
  }
  return value;
}

async function createRoot(db, input) {
  if (!input?.grantId || !input.scope) throw new Error('Risk root and scope are required');
  const units = positiveUnits(input.units);
  return withTransaction(db, async (tx) => {
    await tx.run(`INSERT INTO morph_risk_grants
      (grant_id, root_id, parent_id, owner_node_id, scope_json, initial_units, available_units, spent_units, delegated_units)
      VALUES (?, ?, NULL, ?, ?, ?, ?, 0, 0)`,
    [input.grantId, input.grantId, input.ownerNodeId || input.grantId, JSON.stringify(input.scope), units, units]);
    await audit(tx, { rootId: input.grantId, kind: 'ROOT_CREATED', payload: { grantId: input.grantId, units } });
    return { grantId: input.grantId, availableUnits: units };
  });
}

async function splitGrant(db, input) {
  const children = Array.isArray(input?.children) ? input.children : [];
  if (!children.length || new Set(children.map((c) => c.grantId)).size !== children.length) {
    throw new Error('Distinct child grants are required');
  }
  const total = children.reduce((sum, child) => sum + positiveUnits(child.units), 0);
  return withTransaction(db, async (tx) => {
    const parent = await tx.get('SELECT * FROM morph_risk_grants WHERE grant_id = ?', [input.parentId]);
    if (!parent || parent.available_units < total) throw new Error('RISK_BUDGET_EXHAUSTED');
    await tx.run(`UPDATE morph_risk_grants SET available_units = available_units - ?,
      delegated_units = delegated_units + ? WHERE grant_id = ?`, [total, total, input.parentId]);
    for (const child of children) {
      await tx.run(`INSERT INTO morph_risk_grants
        (grant_id, root_id, parent_id, owner_node_id, scope_json, initial_units, available_units, spent_units, delegated_units)
        VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0)`,
      [child.grantId, parent.root_id, input.parentId, child.ownerNodeId,
        parent.scope_json, child.units, child.units]);
    }
    await audit(tx, { rootId: parent.root_id, kind: 'GRANT_SPLIT', payload: { parentId: input.parentId, children } });
    return { parentId: input.parentId, delegatedUnits: total, children: children.map((c) => c.grantId) };
  });
}

function priorReservation(prior, input, units) {
  if (!prior) return null;
  if (prior.grant_id !== input.grantId || prior.alpha_units !== units
    || prior.protocol_hash !== input.protocolHash || prior.evaluation_set_id !== input.evaluationSetId) {
    throw new Error('RISK_TEST_ID_CONFLICT');
  }
  return { testId: input.testId, idempotent: true, status: prior.status };
}

async function reserveTest(db, input) {
  if (!input?.testId || !input.grantId || !input.protocolHash || !input.evaluationSetId) {
    throw new Error('Test, grant, protocol and evaluation set are required');
  }
  const units = positiveUnits(input.units);
  return withTransaction(db, async (tx) => {
    const prior = await tx.get('SELECT * FROM morph_risk_tests WHERE test_id = ?', [input.testId]);
    const priorResult = priorReservation(prior, input, units);
    if (priorResult) return priorResult;
    const grant = await tx.get('SELECT available_units, root_id FROM morph_risk_grants WHERE grant_id = ?', [input.grantId]);
    if (!grant || grant.available_units < units) throw new Error('RISK_BUDGET_EXHAUSTED');
    await tx.run('UPDATE morph_risk_grants SET available_units = available_units - ? WHERE grant_id = ?', [units, input.grantId]);
    await tx.run(`INSERT INTO morph_risk_tests
      (test_id, grant_id, alpha_units, protocol_hash, evaluation_set_id, status)
      VALUES (?, ?, ?, ?, ?, 'RESERVED')`,
    [input.testId, input.grantId, units, input.protocolHash, input.evaluationSetId]);
    await audit(tx, { rootId: grant.root_id, kind: 'TEST_RESERVED',
      payload: { testId: input.testId, grantId: input.grantId, units } });
    return { testId: input.testId, status: 'RESERVED', alpha: units / 1000000000 };
  });
}

function validReceipt(input) {
  const receipt = input?.receipt;
  return Boolean(input?.testId && receipt?.testId === input.testId
    && statisticalReceipt.verify(receipt));
}

function boundReceipt(test, receipt) {
  if (!test || test.evaluation_set_id !== receipt.evaluationSetId
    || test.protocol_hash !== receipt.protocolHash) throw new Error('RISK_TEST_BINDING_INVALID');
}

function consumedResult(test, receipt, testId) {
  const old = JSON.parse(test.receipt_json);
  if (JSON.stringify(old) !== JSON.stringify(receipt)) throw new Error('RISK_TEST_RECEIPT_CONFLICT');
  return { testId, eligible: old.pValue <= test.alpha_units / 1000000000, idempotent: true };
}

async function finalizeTest(db, input) {
  const receipt = input?.receipt;
  if (!validReceipt(input)) throw new Error('VALID_STATISTICAL_RECEIPT_REQUIRED');
  return withTransaction(db, async (tx) => {
    const test = await tx.get('SELECT * FROM morph_risk_tests WHERE test_id = ?', [input.testId]);
    boundReceipt(test, receipt);
    if (test.status === 'CONSUMED') return consumedResult(test, receipt, input.testId);
    await tx.run("UPDATE morph_risk_tests SET status = 'CONSUMED', receipt_json = ? WHERE test_id = ?",
      [JSON.stringify(receipt), input.testId]);
    await tx.run('UPDATE morph_risk_grants SET spent_units = spent_units + ? WHERE grant_id = ?', [test.alpha_units, test.grant_id]);
    const grant = await tx.get('SELECT root_id FROM morph_risk_grants WHERE grant_id = ?', [test.grant_id]);
    const eligible = receipt.pValue <= test.alpha_units / 1000000000;
    await audit(tx, { rootId: grant.root_id, kind: 'TEST_CONSUMED',
      payload: { testId: input.testId, eligible } });
    return { testId: input.testId, eligible, alpha: test.alpha_units / 1000000000 };
  });
}

async function mergeOwnership(db, input) {
  if (!input?.newOwnerNodeId || !Array.isArray(input.grantIds) || !input.grantIds.length) {
    throw new Error('Merge owner and grants are required');
  }
  return withTransaction(db, async (tx) => {
    const grants = [];
    for (const id of new Set(input.grantIds)) {
      const grant = await tx.get('SELECT * FROM morph_risk_grants WHERE grant_id = ?', [id]);
      if (!grant) throw new Error('RISK_GRANT_NOT_FOUND');
      grants.push(grant);
    }
    if (new Set(grants.map((g) => g.root_id)).size !== 1) throw new Error('RISK_SCOPE_MISMATCH');
    for (const grant of grants) {
      await tx.run('UPDATE morph_risk_grants SET owner_node_id = ? WHERE grant_id = ?', [input.newOwnerNodeId, grant.grant_id]);
    }
    await audit(tx, { rootId: grants[0].root_id, kind: 'OWNERSHIP_MERGED',
      payload: { grantIds: grants.map((g) => g.grant_id), owner: input.newOwnerNodeId } });
    return { rootId: grants[0].root_id, grantIds: grants.map((g) => g.grant_id), newOwnerNodeId: input.newOwnerNodeId };
  });
}

async function grantBalance(db, grantId) {
  const grant = await db.get('SELECT * FROM morph_risk_grants WHERE grant_id = ?', [grantId]);
  if (!grant) throw new Error('RISK_GRANT_NOT_FOUND');
  const pending = await db.get("SELECT COALESCE(SUM(alpha_units), 0) AS units FROM morph_risk_tests WHERE grant_id = ? AND status = 'RESERVED'", [grantId]);
  return { grantId, initial: grant.initial_units, available: grant.available_units,
    spent: grant.spent_units, delegated: grant.delegated_units, reserved: pending.units,
    conserved: grant.initial_units === grant.available_units + grant.spent_units + grant.delegated_units + pending.units };
}

module.exports = { createRoot, splitGrant, reserveTest, finalizeTest, mergeOwnership, grantBalance };
