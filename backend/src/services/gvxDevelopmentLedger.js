'use strict';

const { randomUUID } = require('crypto');

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

function typeErrors(event) {
  return EVENT_TYPES.includes(event.type) ? [] : ['event-type-unknown'];
}

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
  const row = {
    id: event.id || randomUUID(),
    organizationId: event.organizationId,
    projectId: event.projectId,
    entityId: event.entityId,
    type: event.type,
    parentHash: event.parentHash || null,
    candidateHash: event.candidateHash || null,
    payloadJson: JSON.stringify(event.payload)
  };
  await db.run(
    `INSERT INTO gvx_development_events
      (id, organization_id, project_id, entity_id, event_type, parent_hash, candidate_hash, payload_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    row.id, row.organizationId, row.projectId, row.entityId, row.type,
    row.parentHash, row.candidateHash, row.payloadJson
  );
  return getEvent(db, row.id, { organizationId: row.organizationId, projectId: row.projectId });
}

async function getEvent(db, id, scope) {
  return db.get(
    `SELECT id, organization_id AS organizationId, project_id AS projectId,
      entity_id AS entityId, event_type AS type, parent_hash AS parentHash,
      candidate_hash AS candidateHash, payload_json AS payloadJson, created_at AS createdAt
     FROM gvx_development_events
     WHERE id = ? AND organization_id = ? AND project_id = ?`,
    id, scope.organizationId, scope.projectId
  ).then(parsePayload);
}

async function listEvents(db, query) {
  const rows = await db.all(
    `SELECT id, organization_id AS organizationId, project_id AS projectId,
      entity_id AS entityId, event_type AS type, parent_hash AS parentHash,
      candidate_hash AS candidateHash, payload_json AS payloadJson, created_at AS createdAt
     FROM gvx_development_events
     WHERE organization_id = ? AND project_id = ? AND entity_id = ?
     ORDER BY rowid ASC LIMIT ?`,
    query.organizationId, query.projectId, query.entityId, boundedLimit(query.limit)
  );
  return rows.map(parsePayload);
}

function parsePayload(row) {
  if (!row) return row;
  return { ...row, payload: JSON.parse(row.payloadJson), payloadJson: undefined };
}

function boundedLimit(limit) {
  const parsed = Number.isInteger(limit) ? limit : 500;
  return Math.min(2000, Math.max(1, parsed));
}

module.exports = { EVENT_TYPES, validateEvent, appendEvent, getEvent, listEvents };
