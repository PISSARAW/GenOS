'use strict';

const { randomUUID } = require('crypto');
const integrity = require('./gvxLedgerIntegrity');

const EVENT_TYPES = Object.freeze([
  'snapshot_created', 'transformation_proposed', 'experiment_started',
  'experiment_finished', 'evidence_attached', 'decision_recorded',
  'application_recorded', 'transfer_recorded', 'rollback_recorded'
]);
const HASH = /^[a-f0-9]{64}$/;

function validateEvent(event) {
  if (!event || typeof event !== 'object' || Array.isArray(event)) return ['event-object-required'];
  return [...scopeErrors(event), ...typeErrors(event), ...hashErrors(event), ...payloadErrors(event)];
}

function scopeErrors(event) {
  return ['organizationId', 'projectId', 'entityId']
    .filter((field) => typeof event[field] !== 'string' || !event[field].trim())
    .map((field) => `${field}-required`);
}

function typeErrors(event) { return EVENT_TYPES.includes(event.type) ? [] : ['event-type-unknown']; }

function hashErrors(event) {
  return ['parentHash', 'candidateHash']
    .filter((field) => event[field] !== undefined && event[field] !== null && !HASH.test(event[field]))
    .map((field) => `${field}-invalid`);
}

function payloadErrors(event) {
  return event.payload && typeof event.payload === 'object' && !Array.isArray(event.payload)
    ? [] : ['payload-object-required'];
}

async function appendEvent(db, event) {
  const errors = validateEvent(event);
  if (errors.length) throw Object.assign(new Error(errors.join(',')), { code: 'GVX_EVENT_INVALID', errors });
  const scope = { organizationId: event.organizationId, projectId: event.projectId, entityId: event.entityId };
  const chain = await verifyLedgerChain(db, scope);
  assertValidChain(chain);
  const row = buildRow(event, chain.headHash);
  await insertRow(db, row);
  return getEvent(db, row.id, scope);
}

function buildRow(event, previousEventHash) {
  const row = { id: event.id || randomUUID(), organizationId: event.organizationId,
    projectId: event.projectId, entityId: event.entityId, type: event.type,
    parentHash: event.parentHash || null, candidateHash: event.candidateHash || null,
    payloadJson: JSON.stringify(event.payload), createdAt: new Date().toISOString(), previousEventHash };
  row.eventHash = integrity.hashEvent(previousEventHash, row);
  row.controlPlaneMac = integrity.macEvent(row.eventHash);
  return row;
}

async function insertRow(db, row) {
  await db.run(`INSERT INTO gvx_development_events
    (id, organization_id, project_id, entity_id, event_type, parent_hash, candidate_hash,
      payload_json, previous_event_hash, event_hash, control_plane_mac, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, row.id, row.organizationId, row.projectId,
  row.entityId, row.type, row.parentHash, row.candidateHash, row.payloadJson,
  row.previousEventHash, row.eventHash, row.controlPlaneMac, row.createdAt);
}

async function getEvent(db, id, scope) {
  const rows = await readScopeEvents(db, scope);
  assertValidChain(integrity.verifyRows(rows, secretOptions()));
  return parsePayload(rows.find((row) => row.id === id));
}

async function listEvents(db, query) {
  const rows = await readScopeEvents(db, query);
  assertValidChain(integrity.verifyRows(rows, secretOptions()));
  return rows.slice(0, boundedLimit(query.limit)).map(parsePayload);
}

async function verifyLedgerChain(db, scope) {
  const rows = await readScopeEvents(db, scope);
  return integrity.verifyRows(rows, secretOptions());
}

async function readScopeEvents(db, scope) {
  const rows = await db.all(`SELECT id, organization_id AS organizationId, project_id AS projectId,
    entity_id AS entityId, event_type AS type, parent_hash AS parentHash,
    candidate_hash AS candidateHash, payload_json AS payloadJson, created_at AS createdAt,
    previous_event_hash AS previousEventHash, event_hash AS eventHash, control_plane_mac AS controlPlaneMac
    FROM gvx_development_events WHERE organization_id = ? AND project_id = ? AND entity_id = ?
    ORDER BY rowid ASC`, scope.organizationId, scope.projectId, scope.entityId);
  return rows;
}

function parsePayload(row) {
  if (!row) return row;
  return { ...row, payload: JSON.parse(row.payloadJson), payloadJson: undefined };
}

function assertValidChain(result) {
  if (result.valid) return;
  throw Object.assign(new Error(`gvx-ledger-chain-invalid:${result.reason}`), {
    code: 'GVX_LEDGER_CHAIN_INVALID', integrity: result
  });
}

function secretOptions() {
  return { secret: process.env.GENOS_GVX_LEDGER_HMAC_SECRET || undefined };
}

function boundedLimit(limit) {
  const parsed = Number.isInteger(limit) ? limit : 500;
  return Math.min(2000, Math.max(1, parsed));
}

module.exports = { EVENT_TYPES, validateEvent, appendEvent, getEvent, listEvents,
  verifyLedgerChain, boundedLimit };
