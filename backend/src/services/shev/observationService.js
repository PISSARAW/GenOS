'use strict';

const { createHash, verify } = require('node:crypto');
const { getResponsibility } = require('./responsibilityService');
const { publicKeyOf } = require('./authorityService');

const KINDS = new Set(['state', 'degradation', 'risk', 'opportunity', 'capability_gap', 'blind_spot']);
const STATUSES = new Set(['observed', 'unknown', 'stale', 'invalid', 'inconclusive']);
const SAFE_ID = /^[A-Za-z0-9._:-]{1,128}$/;

function validDate(value) {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

function validText(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function validIdentity(input) {
  return input && SAFE_ID.test(input.id) && ['projectId', 'domain', 'dimension', 'source', 'summary']
    .every((key) => validText(input[key])) && input.source.length <= 256
    && input.summary.length <= 2048;
}

function validClassification(input) {
  return KINDS.has(input.kind) && STATUSES.has(input.epistemicStatus)
    && validDate(input.observedAt) && (!input.validUntil || validDate(input.validUntil));
}

function validEvidence(input) {
  return Array.isArray(input.evidenceRefs) && input.evidenceRefs.length <= 20
    && input.evidenceRefs.every((ref) => validText(ref) && ref.length <= 512)
    && (input.epistemicStatus !== 'observed' || input.evidenceRefs.length > 0);
}

function normalizedObservation(input) {
  if (!validIdentity(input) || !validClassification(input)) {
    throw new TypeError('SHEV observation is invalid.');
  }
  if (!validEvidence(input)) {
    throw new TypeError('Observed SHEV evidence references are required.');
  }
  return { id: input.id, projectId: input.projectId, domain: input.domain,
    dimension: input.dimension, kind: input.kind, epistemicStatus: input.epistemicStatus,
    source: input.source, observedAt: new Date(input.observedAt).toISOString(),
    validUntil: input.validUntil ? new Date(input.validUntil).toISOString() : null,
    summary: input.summary, evidenceRefs: [...new Set(input.evidenceRefs)] };
}

function observationPayload(observation) {
  return JSON.stringify(observation);
}

function requireAttestation(observation, responsibility, attestation) {
  const policy = responsibility.mandate.endogenousPolicy;
  if (!policy?.enabled) return null;
  if (attestation?.keyId !== policy.observerKeyId
    || typeof attestation.signature !== 'string') {
    throw new Error('SHEV endogenous observation requires the enrolled observer signature.');
  }
  const payload = observationPayload(observation);
  const valid = verify(null, Buffer.from(payload), publicKeyOf(policy.observerPublicKey),
    Buffer.from(attestation.signature, 'base64'));
  if (!valid) throw new Error('SHEV endogenous observation signature is invalid.');
  return { keyId: attestation.keyId, signature: attestation.signature,
    payloadHash: createHash('sha256').update(payload).digest('hex') };
}

async function persistAttestation(db, observation, attestation) {
  if (!attestation) return;
  await db.run(`INSERT OR IGNORE INTO shev_observation_attestations
    (project_id, observation_id, key_id, payload_hash, signature, verified_at)
    VALUES (?, ?, ?, ?, ?, ?)`, [observation.projectId, observation.id,
    attestation.keyId, attestation.payloadHash, attestation.signature,
    new Date().toISOString()]);
}

async function recordObservation(db, input) {
  const observation = normalizedObservation(input);
  const responsibility = await getResponsibility(db, observation.projectId);
  if (!responsibility || responsibility.status !== 'active') throw new Error('SHEV responsibility is not active.');
  if (!responsibility.mandate.dimensions.some((dimension) => dimension.name === observation.dimension)) {
    throw new Error('SHEV observation dimension is outside the mandate.');
  }
  const attestation = requireAttestation(observation, responsibility, input.attestation);
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
  await persistAttestation(db, observation, attestation);
  return { ...observation, replayed: inserted.changes === 0 };
}

module.exports = { recordObservation, normalizedObservation, observationPayload };
