'use strict';

const { withTransaction } = require('../../db');
const { canonicalJson } = require('../aTeam/variants/variantExecutionHelpers');
const ledger = require('./responsibilityLedgerService');

function required(value, code) {
  if (typeof value !== 'string' || !value.trim()) throw ledger.coded(code, 'A non-empty value is required.');
  return value;
}

function provenance(input) {
  return {
    collectorId: required(input?.collectorId, 'AMBIENT_COLLECTOR_REQUIRED'),
    permissionRef: required(input?.permissionRef, 'AMBIENT_PERMISSION_REQUIRED')
  };
}

function minimize(payload, allowedFields) {
  if (!payload || Array.isArray(payload) || typeof payload !== 'object') {
    throw ledger.coded('AMBIENT_PAYLOAD_REQUIRED', 'Observation payload must be an object.');
  }
  const minimized = Object.fromEntries(allowedFields.filter((key) => payload[key] !== undefined)
    .map((key) => [key, payload[key]]));
  if (!Object.keys(minimized).length) {
    throw ledger.coded('AMBIENT_MINIMIZATION_EMPTY', 'No permitted observation field is present.');
  }
  return minimized;
}

function assertObservationAuthority(input, responsibility) {
  if (responsibility.status !== 'ACTIVE') {
    throw ledger.coded('AMBIENT_RESPONSIBILITY_REVOKED', 'Revoked responsibility cannot observe.');
  }
  if (!responsibility.policy.allowedApps.includes(input.sourceApp)) {
    throw ledger.coded('AMBIENT_APP_NOT_ALLOWED', 'Source app is outside the responsibility membrane.');
  }
  if (input.consentRef !== responsibility.consentRef) {
    throw ledger.coded('AMBIENT_CONSENT_STALE', 'Observation consent does not match the current version.');
  }
}

async function existingObservation(db, scope, observationId) {
  return db.get(`SELECT o.*,p.minimized_json,p.forgotten_at FROM ambient_observations o
    JOIN ambient_observation_payloads p USING(organization_id,project_id,observation_id)
    WHERE o.organization_id=? AND o.project_id=? AND o.observation_id=?`,
  scope.organizationId, scope.projectId, observationId);
}

function observationRecord(input, responsibility) {
  const minimized = minimize(input.payload, responsibility.policy.allowedFields);
  const record = {
    observationId: required(input.observationId, 'AMBIENT_OBSERVATION_REQUIRED'),
    responsibilityId: responsibility.responsibilityId,
    responsibilityVersion: responsibility.version,
    sourceApp: required(input.sourceApp, 'AMBIENT_SOURCE_APP_REQUIRED'),
    sourceRef: required(input.sourceRef, 'AMBIENT_SOURCE_REF_REQUIRED'),
    consentRef: required(input.consentRef, 'AMBIENT_CONSENT_REQUIRED'),
    provenance: provenance(input.provenance),
    minimizedHash: ledger.hash(minimized),
    observedAt: required(input.observedAt, 'AMBIENT_OBSERVED_AT_REQUIRED')
  };
  return { record, minimized };
}

async function ingest(db, input) {
  const scope = ledger.tenant(input);
  await ledger.ensure(db);
  return withTransaction(db, async () => {
    const responsibility = await ledger.currentInTransaction(db, { ...scope,
      responsibilityId: input.responsibilityId });
    assertObservationAuthority(input, responsibility);
    const { record, minimized } = observationRecord(input, responsibility);
    const contentHash = ledger.hash({ record, minimized });
    const existing = await existingObservation(db, scope, record.observationId);
    if (existing) {
      if (existing.content_hash === contentHash) return { record, minimized, replayed: true };
      throw ledger.coded('AMBIENT_OBSERVATION_CONFLICT', 'Observation identifier is already bound.');
    }
    await db.run(`INSERT INTO ambient_observations
      (organization_id,project_id,observation_id,responsibility_id,responsibility_version,
       source_app,source_ref,consent_ref,provenance_json,content_hash,observed_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)`, scope.organizationId, scope.projectId,
    record.observationId, record.responsibilityId, record.responsibilityVersion,
    record.sourceApp, record.sourceRef, record.consentRef, canonicalJson(record.provenance),
    contentHash, record.observedAt);
    await db.run(`INSERT INTO ambient_observation_payloads
      (organization_id,project_id,observation_id,minimized_json) VALUES (?,?,?,?)`,
    scope.organizationId, scope.projectId, record.observationId, canonicalJson(minimized));
    await appendEvent(db, { scope, observationId: record.observationId, eventKind: 'INGEST',
      event: { eventId: `ingest:${record.observationId}`, contentHash,
        observedAt: record.observedAt } });
    return { record, minimized, replayed: false };
  });
}

async function appendEvent(db, input) {
  const { scope, observationId, eventKind, event } = input;
  await db.run(`INSERT INTO ambient_observation_events
    (organization_id,project_id,event_id,observation_id,event_kind,event_json)
    VALUES (?,?,?,?,?,?)`, scope.organizationId, scope.projectId, event.eventId,
  observationId, eventKind, canonicalJson(event));
}

async function revokeAndForget(db, input) {
  const scope = ledger.tenant(input);
  await ledger.ensure(db);
  return withTransaction(db, async () => {
    const responsibility = await ledger.revokeInTransaction(db, input);
    const rows = await db.all(`SELECT o.observation_id FROM ambient_observations o
      JOIN ambient_observation_payloads p USING(organization_id,project_id,observation_id)
      WHERE o.organization_id=? AND o.project_id=? AND o.responsibility_id=?
        AND p.minimized_json IS NOT NULL`, scope.organizationId, scope.projectId,
    responsibility.responsibilityId);
    for (const row of rows) {
      await db.run(`UPDATE ambient_observation_payloads SET minimized_json=NULL,forgotten_at=?
        WHERE organization_id=? AND project_id=? AND observation_id=?`,
      input.payload.recordedAt, scope.organizationId, scope.projectId, row.observation_id);
      await appendEvent(db, { scope, observationId: row.observation_id, eventKind: 'FORGET',
        event: { eventId: `forget:${row.observation_id}:${responsibility.version}`,
          revocationRef: responsibility.revocationRef,
          forgottenAt: input.payload.recordedAt } });
    }
    return { responsibility, forgottenCount: rows.length };
  });
}

async function read(db, input) {
  const scope = ledger.tenant(input);
  await ledger.ensure(db);
  const row = await existingObservation(db, scope,
    required(input.observationId, 'AMBIENT_OBSERVATION_REQUIRED'));
  if (!row) throw ledger.coded('AMBIENT_OBSERVATION_NOT_FOUND', 'Observation was not found.');
  return { observationId: row.observation_id, sourceApp: row.source_app,
    sourceRef: row.source_ref, contentHash: row.content_hash,
    provenance: JSON.parse(row.provenance_json),
    minimized: row.minimized_json ? JSON.parse(row.minimized_json) : null,
    forgottenAt: row.forgotten_at };
}

module.exports = { ingest, revokeAndForget, read, minimize };
