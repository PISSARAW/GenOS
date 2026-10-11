'use strict';

const { randomUUID } = require('node:crypto');
const { migrateBodyActionReceipts } = require('../db/migrations/migrateBodyActionReceipts');

function validText(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function assertInput(input) {
  if (!input?.db || !validText(input.agentId) || !validText(input.runId)
    || !validText(input.effectorId) || !validText(input.actionId)) {
    throw new TypeError('Body action identity requires db, agent, run, effector and action.');
  }
}

function assertAuthorized(input, authority) {
  if (authority?.status !== 'authorized' || !validText(authority.hash)
    || authority.envelope?.scope?.entityId !== input.agentId
    || authority.envelope?.runId !== input.runId
    || !validText(authority.envelope?.missionId)) {
    throw Object.assign(new Error('Body action requires a bound mission authority.'), {
      code: 'BODY_ACTION_AUTHORITY_REQUIRED'
    });
  }
}

async function predict(input) {
  assertInput(input);
  const authority = await require('./missionEnvelopeAuthority').assertRun(input.db, {
    agentId: input.agentId, runId: input.runId
  });
  assertAuthorized(input, authority);
  await migrateBodyActionReceipts(input.db);
  await input.db.run(`INSERT OR IGNORE INTO body_action_receipts
    (action_id, agent_id, mission_id, run_id, effector_id, authority_hash, prediction_json, phase)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'predicted')`, input.actionId, input.agentId,
  authority.envelope.missionId, input.runId, input.effectorId, authority.hash,
  JSON.stringify(input.prediction || {}));
  const row = await input.db.get('SELECT * FROM body_action_receipts WHERE action_id = ?', input.actionId);
  if (row.agent_id !== input.agentId || row.run_id !== input.runId
    || row.effector_id !== input.effectorId || row.authority_hash !== authority.hash
    || row.prediction_json !== JSON.stringify(input.prediction || {})) {
    throw Object.assign(new Error('Body action identity collision.'), { code: 'BODY_ACTION_IDENTITY_COLLISION' });
  }
  return { actionId: row.action_id, agentId: row.agent_id, runId: row.run_id,
    missionId: row.mission_id, effectorId: row.effector_id, phase: row.phase };
}

async function observe(input) {
  assertInput(input);
  await migrateBodyActionReceipts(input.db);
  const row = await input.db.get('SELECT * FROM body_action_receipts WHERE action_id = ?', input.actionId);
  if (!row || row.agent_id !== input.agentId || row.run_id !== input.runId
    || row.effector_id !== input.effectorId) return { matched: false };
  const changed = await input.db.run(`UPDATE body_action_receipts
    SET outcome_json = ?, phase = 'observed', observed_at = CURRENT_TIMESTAMP
    WHERE action_id = ? AND agent_id = ? AND run_id = ? AND phase = 'predicted'`,
  JSON.stringify(input.outcome || {}), input.actionId, input.agentId, input.runId);
  return { matched: changed.changes === 1, actionId: input.actionId };
}

async function read(db, actionId) {
  await migrateBodyActionReceipts(db);
  const row = await db.get('SELECT * FROM body_action_receipts WHERE action_id = ?', actionId);
  if (!row) return null;
  return { actionId: row.action_id, agentId: row.agent_id, missionId: row.mission_id,
    runId: row.run_id, effectorId: row.effector_id, authorityHash: row.authority_hash,
    prediction: JSON.parse(row.prediction_json), outcome: row.outcome_json && JSON.parse(row.outcome_json),
    phase: row.phase };
}

function actionId() { return randomUUID(); }

module.exports = { predict, observe, read, actionId };
