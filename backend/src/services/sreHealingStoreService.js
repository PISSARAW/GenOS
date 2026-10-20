'use strict';

const crypto = require('node:crypto');
const { withTransaction } = require('../db');
const migration = require('../db/migrations/migrateSreHealingCampaigns');

const NEXT_STATES = Object.freeze({
  DETECTED: ['INVESTIGATING', 'CANDIDATE_READY', 'ABSTAINED'],
  INVESTIGATING: ['INVESTIGATING', 'CANDIDATE_READY', 'ABSTAINED'],
  CANDIDATE_READY: ['AUTHORIZED', 'ABSTAINED'],
  AUTHORIZED: ['OBSERVING', 'VERIFIED', 'ROLLBACK_REQUIRED'],
  OBSERVING: ['OBSERVING', 'VERIFIED', 'ROLLBACK_REQUIRED'],
  ROLLBACK_REQUIRED: ['ROLLED_BACK']
});

function coded(code, message) {
  return Object.assign(new Error(message), { code });
}

function required(value, code) {
  if (typeof value !== 'string' || !value.trim()) throw coded(code, 'A non-empty value is required.');
  return value.trim();
}

function hash(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function serialize(value) {
  return JSON.stringify(value);
}

function scopeOf(snapshot) {
  return { organizationId: required(snapshot?.scope?.organizationId, 'SRE_STORE_ORGANIZATION_REQUIRED'),
    projectId: required(snapshot?.scope?.projectId, 'SRE_STORE_PROJECT_REQUIRED'),
    campaignId: required(snapshot?.campaignId, 'SRE_STORE_CAMPAIGN_REQUIRED') };
}

function timestamp(value) {
  const parsed = Date.parse(value || new Date().toISOString());
  if (!Number.isFinite(parsed)) throw coded('SRE_STORE_TIME_INVALID', 'occurredAt must be an ISO timestamp.');
  return new Date(parsed).toISOString();
}

function receiptFor(context) {
  const body = { campaignId: context.scope.campaignId, sequence: context.sequence,
    previousReceiptId: context.previousReceiptId, fromState: context.fromState,
    toState: context.snapshot.status, snapshotHash: context.snapshotHash,
    occurredAt: context.occurredAt };
  const receiptId = `sre_receipt_${hash(serialize(body)).slice(0, 24)}`;
  const receipt = { receiptId, ...body };
  return { receipt, receiptJson: serialize(receipt), receiptHash: hash(serialize(receipt)) };
}

function parseSnapshot(row) {
  if (!row || hash(row.snapshot_json) !== row.snapshot_hash) {
    throw coded('SRE_STORE_INTEGRITY_FAILED', 'Campaign snapshot integrity failed.');
  }
  try { return JSON.parse(row.snapshot_json); } catch (_) {
    throw coded('SRE_STORE_INTEGRITY_FAILED', 'Campaign snapshot is not valid JSON.');
  }
}

async function ensure(db) {
  await migration.migrateSreHealingCampaigns(db);
}

async function scopedRow(db, scope) {
  return db.get(`SELECT * FROM sre_healing_campaigns
    WHERE organization_id=? AND project_id=? AND campaign_id=?`,
  scope.organizationId, scope.projectId, scope.campaignId);
}

async function getCampaign(db, scope) {
  await ensure(db);
  const row = await scopedRow(db, scope);
  if (!row) return null;
  const snapshot = parseSnapshot(row);
  const head = await db.get(`SELECT * FROM sre_healing_receipts
    WHERE organization_id=? AND project_id=? AND receipt_id=?`,
  scope.organizationId, scope.projectId, row.current_receipt_id);
  if (!head || head.snapshot_hash !== row.snapshot_hash || head.sequence !== row.version) {
    throw coded('SRE_STORE_INTEGRITY_FAILED', 'Campaign head receipt is inconsistent.');
  }
  return { snapshot, version: row.version, receiptId: row.current_receipt_id };
}

async function insertInitial(db, context) {
  const { scope, snapshot, snapshotJson, snapshotHash, occurredAt } = context;
  const head = receiptFor({ scope, snapshot, snapshotHash, occurredAt,
    sequence: 1, previousReceiptId: null, fromState: null });
  await db.run(`INSERT INTO sre_healing_campaigns
    (organization_id,project_id,campaign_id,service_id,responsibility_agent_id,status,
     version,current_receipt_id,snapshot_hash,snapshot_json,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`, scope.organizationId, scope.projectId,
  scope.campaignId, snapshot.scope.serviceId, snapshot.scope.responsibilityAgentId,
  snapshot.status, 1, head.receipt.receiptId, snapshotHash, snapshotJson, occurredAt, occurredAt);
  await db.run(`INSERT INTO sre_healing_receipts
    (organization_id,project_id,campaign_id,receipt_id,sequence,previous_receipt_id,
     from_state,to_state,snapshot_hash,receipt_hash,receipt_json,created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`, scope.organizationId, scope.projectId,
  scope.campaignId, head.receipt.receiptId, 1, null, null, snapshot.status,
  snapshotHash, head.receiptHash, head.receiptJson, occurredAt);
  return { snapshot, version: 1, receiptId: head.receipt.receiptId };
}

async function createCampaign(db, input = {}) {
  await ensure(db);
  const snapshot = input.snapshot;
  if (snapshot?.status !== 'DETECTED') {
    throw coded('SRE_STORE_INITIAL_STATE_INVALID', 'Campaign must start in DETECTED.');
  }
  const scope = scopeOf(snapshot);
  const occurredAt = timestamp(input.occurredAt);
  const snapshotJson = serialize(snapshot);
  const snapshotHash = hash(snapshotJson);
  return withTransaction(db, async () => {
    const existing = await getCampaign(db, scope);
    if (existing) {
      if (hash(serialize(existing.snapshot)) !== snapshotHash) {
        throw coded('SRE_STORE_IDEMPOTENCY_CONFLICT', 'Campaign id is bound to another snapshot.');
      }
      return { ...existing, replayed: true };
    }
    return { ...await insertInitial(db,
      { scope, snapshot, snapshotJson, snapshotHash, occurredAt }), replayed: false };
  });
}

function assertTransition(current, next) {
  const allowed = NEXT_STATES[current.snapshot.status] || [];
  if (!allowed.includes(next.status)) {
    throw coded('SRE_STORE_TRANSITION_INVALID', `${current.snapshot.status} cannot transition to ${next.status}.`);
  }
  const nextScope = scopeOf(next);
  const currentScope = scopeOf(current.snapshot);
  if (serialize(nextScope) !== serialize(currentScope)) {
    throw coded('SRE_STORE_SCOPE_INVALID', 'Campaign identity cannot change.');
  }
  if (next.scope.responsibilityAgentId !== current.snapshot.scope.responsibilityAgentId) {
    throw coded('SRE_STORE_RESPONSIBILITY_INVALID', 'Persistent responsibility cannot be reassigned implicitly.');
  }
}

async function persistTransition(db, context) {
  const head = receiptFor(context);
  await db.run(`INSERT INTO sre_healing_receipts
    (organization_id,project_id,campaign_id,receipt_id,sequence,previous_receipt_id,
     from_state,to_state,snapshot_hash,receipt_hash,receipt_json,created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`, context.scope.organizationId,
  context.scope.projectId, context.scope.campaignId, head.receipt.receiptId,
  context.sequence, context.previousReceiptId, context.fromState,
  context.snapshot.status, context.snapshotHash, head.receiptHash,
  head.receiptJson, context.occurredAt);
  const updated = await db.run(`UPDATE sre_healing_campaigns SET status=?,version=?,
    current_receipt_id=?,snapshot_hash=?,snapshot_json=?,updated_at=?
    WHERE organization_id=? AND project_id=? AND campaign_id=? AND version=?`,
  context.snapshot.status, context.sequence, head.receipt.receiptId,
  context.snapshotHash, context.snapshotJson, context.occurredAt,
  context.scope.organizationId, context.scope.projectId, context.scope.campaignId,
  context.sequence - 1);
  if (updated.changes !== 1) throw coded('SRE_STORE_VERSION_CONFLICT', 'Campaign version changed.');
  return { snapshot: context.snapshot, version: context.sequence,
    receiptId: head.receipt.receiptId };
}

async function appendTransition(db, input = {}) {
  await ensure(db);
  const snapshot = input.snapshot;
  const scope = scopeOf(snapshot);
  return withTransaction(db, async () => {
    const current = await getCampaign(db, scope);
    if (!current) throw coded('SRE_STORE_NOT_FOUND', 'Campaign does not exist.');
    if (current.version !== input.expectedVersion) {
      throw coded('SRE_STORE_VERSION_CONFLICT', 'Campaign version changed.');
    }
    assertTransition(current, snapshot);
    const snapshotJson = serialize(snapshot);
    return persistTransition(db, { scope, snapshot, snapshotJson,
      snapshotHash: hash(snapshotJson), occurredAt: timestamp(input.occurredAt),
      sequence: current.version + 1, previousReceiptId: current.receiptId,
      fromState: current.snapshot.status });
  });
}

async function listReceipts(db, scope) {
  await ensure(db);
  return db.all(`SELECT * FROM sre_healing_receipts
    WHERE organization_id=? AND project_id=? AND campaign_id=? ORDER BY sequence`,
  scope.organizationId, scope.projectId, scope.campaignId);
}

module.exports = { NEXT_STATES, ensure, createCampaign, getCampaign,
  appendTransition, listReceipts };
