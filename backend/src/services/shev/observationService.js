'use strict';

const { createHash } = require('node:crypto');
const { getResponsibility } = require('./responsibilityService');

const KINDS = new Set(['state', 'degradation', 'risk', 'opportunity', 'capability_gap', 'blind_spot']);
const STATUSES = new Set(['observed', 'unknown', 'stale', 'invalid', 'inconclusive']);

function validDate(value) {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

function validText(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function validIdentity(input) {
  return input && ['id', 'projectId', 'domain', 'dimension', 'source', 'summary']
    .every((key) => validText(input[key]));
}

function validClassification(input) {
  return KINDS.has(input.kind) && STATUSES.has(input.epistemicStatus)
    && validDate(input.observedAt) && (!input.validUntil || validDate(input.validUntil));
}

function normalizedObservation(input) {
  if (!validIdentity(input) || !validClassification(input)) {
    throw new TypeError('SHEV observation is invalid.');
  }
  if (!Array.isArray(input.evidenceRefs) || !input.evidenceRefs.every(validText)
    || (input.epistemicStatus === 'observed' && input.evidenceRefs.length === 0)) {
    throw new TypeError('Observed SHEV evidence references are required.');
  }
  return { id: input.id, projectId: input.projectId, domain: input.domain,
    dimension: input.dimension, kind: input.kind, epistemicStatus: input.epistemicStatus,
    source: input.source, observedAt: new Date(input.observedAt).toISOString(),
    validUntil: input.validUntil ? new Date(input.validUntil).toISOString() : null,
    summary: input.summary, evidenceRefs: [...new Set(input.evidenceRefs)] };
}

async function recordObservation(db, input) {
  const observation = normalizedObservation(input);
  const responsibility = await getResponsibility(db, observation.projectId);
  if (!responsibility || responsibility.status !== 'active') throw new Error('SHEV responsibility is not active.');
  if (!responsibility.mandate.dimensions.some((dimension) => dimension.name === observation.dimension)) {
    throw new Error('SHEV observation dimension is outside the mandate.');
  }
  const hash = createHash('sha256').update(JSON.stringify(observation)).digest('hex');
  const inserted = await db.run(`INSERT OR IGNORE INTO shev_observations
    (id, project_id, domain, dimension, kind, epistemic_status, source, observed_at,
      valid_until, summary, evidence_json, content_hash)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  [observation.id, observation.projectId, observation.domain, observation.dimension,
    observation.kind, observation.epistemicStatus, observation.source, observation.observedAt,
    observation.validUntil, observation.summary, JSON.stringify(observation.evidenceRefs), hash]);
  if (inserted.changes === 0) {
    const existing = await db.get(`SELECT content_hash FROM shev_observations
      WHERE project_id = ? AND id = ?`, [observation.projectId, observation.id]);
    if (existing.content_hash !== hash) throw new Error('SHEV observation idempotency conflict.');
  }
  return { ...observation, replayed: inserted.changes === 0 };
}

module.exports = { recordObservation, normalizedObservation };
