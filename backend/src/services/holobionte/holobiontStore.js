'use strict';

const { randomUUID } = require('crypto');
const { withTransaction } = require('../../db');
const { EVENT_TYPES } = require('./constants');
const { createHolobiontSession } = require('./contracts/holobiontSession');
const { normalizeSymbiontKind } = require('./symbionts/symbiontKinds');

function parseSession(row) {
  if (!row) return null;
  return { ...JSON.parse(row.session_json), revision: row.revision, status: row.status };
}

async function appendEventRow(db, input) {
  const row = await db.get('SELECT revision, session_json FROM holobiont_sessions WHERE holobiont_id = ?', input.holobiontId);
  if (!row) throw Object.assign(new Error('Holobiont session not found.'), { code: 'HOLOBIONT_SESSION_NOT_FOUND' });
  if (input.expectedRevision !== undefined && Number(input.expectedRevision) !== row.revision) {
    throw Object.assign(new Error('Holobiont session revision conflict.'), { code: 'HOLOBIONT_REVISION_CONFLICT' });
  }
  const revision = row.revision + 1;
  await db.run(`INSERT INTO holobiont_events
    (event_id, holobiont_id, revision, event_type, payload_json, actor_id)
    VALUES (?, ?, ?, ?, ?, ?)`, randomUUID(), input.holobiontId, revision, input.eventType,
  JSON.stringify(input.payload || {}), input.actorId || null);
  const session = reduceEvent(JSON.parse(row.session_json), input.eventType, input.payload || {});
  session.revision = revision;
  await db.run(`UPDATE holobiont_sessions SET revision = ?, status = ?, constitution_id = ?, session_json = ?,
    updated_at = CURRENT_TIMESTAMP WHERE holobiont_id = ? AND revision = ?`,
  revision, session.status, session.constitutionId, JSON.stringify(session), input.holobiontId, row.revision);
  return revision;
}

function reduceEvent(session, eventType, payload) {
  const handler = eventReducers[eventType];
  return handler ? handler({ ...session }, payload) : session;
}

const eventReducers = {
  CONSTITUTION_UPDATED: updateConstitution,
  SYMBIONT_DISCOVERED: recordCandidate,
  SYMBIONT_ADMISSION_STARTED: beginCandidateTrial,
  SYMBIONT_ADMITTED: admitSymbiont,
  SYMBIONT_QUARANTINED: (session, payload) => changeSymbiontStatus(session, payload, 'QUARANTINED'),
  SYMBIONT_SANCTIONED: (session, payload) => changeSymbiontStatus(session, payload, 'SANCTIONED'),
  SYMBIONT_DORMANT: (session, payload) => changeSymbiontStatus(session, payload, 'DORMANT'),
  SYMBIONT_REJECTED: (session, payload) => removeSymbiont(session, payload, 'candidateSymbionts'),
  SYMBIONT_EXPELLED: removeExpelledSymbiont,
  RESOURCE_GRANTED: (session, payload) => updateResources(session, payload, 'RESOURCE_GRANTED'),
  RESOURCE_REVOKED: (session, payload) => updateResources(session, payload, 'RESOURCE_REVOKED'),
  CONTRIBUTION_VERIFIED: recordContribution,
  IMMUNE_REJECTION: (session, payload) => recordImmuneEvent(session, payload, 'rejections'),
  IMMUNE_OVERRIDE: (session, payload) => recordImmuneEvent(session, payload, 'overrides'),
  VERTICAL_TRANSMISSION: (session, payload) => recordTransmission(session, payload, 'VERTICAL_TRANSMISSION'),
  HORIZONTAL_ACQUISITION: recordHorizontalAcquisition
};

function updateConstitution(session, payload) {
  session.constitutionId = payload.constitutionId || session.constitutionId;
  session.constitution = payload.constitution || session.constitution;
  return session;
}

function recordCandidate(session, payload) {
  const symbiontId = String(payload.symbiontId || '').trim();
  if (!symbiontId) return session;
  const symbiont = payload.symbiont || {};
  session.candidateSymbionts = [...session.candidateSymbionts, {
    ...symbiont, id: symbiontId, kind: normalizeSymbiontKind(symbiont.kind), status: 'CANDIDATE'
  }];
  return session;
}

function beginCandidateTrial(session, payload) {
  updateSymbiont(session.candidateSymbionts, String(payload.symbiontId || ''), {
    status: 'TRIAL',
    admissionTrial: payload.trial, contractId: payload.contractId,
    contractRevision: payload.contractRevision
  });
  return session;
}

function admitSymbiont(session, payload) {
  const symbiontId = String(payload.symbiontId || '');
  const dormant = session.residentSymbionts.find((item) => item.id === symbiontId && item.status === 'DORMANT');
  if (dormant) {
    if (payload.receipt?.immuneReview?.allowed !== true) {
      throw Object.assign(new Error('Resuming a dormant symbiont requires an allowed immune receipt.'), { code: 'HOLOBIONT_RESUMPTION_REVIEW_REQUIRED' });
    }
    updateSymbiont(session.residentSymbionts, symbiontId, { status: 'RESIDENT', admissionReceipt: payload.receipt });
    return session;
  }
  const candidate = session.candidateSymbionts.find((item) => item.id === symbiontId) || { id: symbiontId };
  session.candidateSymbionts = session.candidateSymbionts.filter((item) => item.id !== symbiontId);
  session.residentSymbionts = [...session.residentSymbionts, {
    ...candidate, status: 'RESIDENT', admissionReceipt: payload.receipt || null
  }];
  return session;
}

function changeSymbiontStatus(session, payload, status) {
  const symbiontId = String(payload.symbiontId || '');
  const admission = payload.receipt ? { admissionReceipt: payload.receipt } : {};
  const replacement = payload.replacementSymbiontId
    ? { replacementSymbiontId: payload.replacementSymbiontId, statusReason: payload.reason || null } : {};
  const reason = payload.reason ? { statusReason: payload.reason } : {};
  const update = { ...admission, ...replacement, ...reason, status };
  updateSymbiont(session.candidateSymbionts, symbiontId, update);
  updateSymbiont(session.residentSymbionts, symbiontId, update);
  return session;
}

function recordHorizontalAcquisition(session, payload) {
  const symbiontId = String(payload.symbiontId || '');
  const candidate = session.candidateSymbionts.find((item) => item.id === symbiontId);
  if (payload.releaseReceipt) {
    if (!candidate || candidate.status !== 'QUARANTINED' || payload.immuneReview?.allowed !== true) {
      throw Object.assign(new Error('Only an AEIS-approved quarantined candidate can be released.'), { code: 'HOLOBIONT_QUARANTINE_STATE_INVALID' });
    }
    updateSymbiont(session.candidateSymbionts, symbiontId, {
      status: 'CANDIDATE', quarantineRelease: payload.releaseReceipt
    });
  }
  recordTransmission(session, payload, 'HORIZONTAL_ACQUISITION');
  return session;
}

function removeSymbiont(session, payload, collectionName) {
  const symbiontId = String(payload.symbiontId || '');
  session[collectionName] = session[collectionName].filter((item) => item.id !== symbiontId);
  return session;
}

function removeExpelledSymbiont(session, payload) {
  removeSymbiont(session, payload, 'candidateSymbionts');
  return removeSymbiont(session, payload, 'residentSymbionts');
}

function updateSymbiont(collection, symbiontId, update) {
  const index = collection.findIndex((item) => item.id === symbiontId);
  if (index >= 0) collection[index] = { ...collection[index], ...update };
}

function updateResources(session, payload, eventType) {
  const allocations = { ...(session.resourceState.allocations || {}) };
  const key = String(payload.symbiontId || 'host');
  if (eventType === 'RESOURCE_REVOKED') delete allocations[key];
  else allocations[key] = {
    allocationId: payload.allocationId || null,
    resources: payload.resources || {},
    explanation: payload.explanation || {},
    contractId: payload.contractId || null,
    contractRevision: payload.contractRevision || null,
    contributionScore: payload.contributionScore || 0
  };
  session.resourceState = { ...session.resourceState, allocations };
  return session;
}

function recordContribution(session, payload) {
  session.verifiedContributions = [...(session.verifiedContributions || []), payload];
  return session;
}

function recordImmuneEvent(session, payload, key) {
  const current = session.immuneState[key] || [];
  session.immuneState = { ...session.immuneState, [key]: [...current, payload] };
  return session;
}

function recordTransmission(session, payload, eventType) {
  const history = session.transmissionState.history || [];
  session.transmissionState = { ...session.transmissionState, history: [...history, { ...payload, type: eventType }] };
  return session;
}

async function createSession(db, input) {
  const session = createHolobiontSession(input);
  await withTransaction(db, async (tx) => {
    await tx.run(`INSERT INTO holobiont_sessions
      (holobiont_id, host_id, mission_id, constitution_id, scope, workspace_id,
       project_id, status, revision, session_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`, session.holobiontId, session.hostId,
    session.missionId, session.constitutionId, session.scope, session.workspaceId,
    session.projectId, session.status, JSON.stringify(session));
    await appendEventRow(tx, {
      holobiontId: session.holobiontId,
      eventType: 'HOST_CREATED',
      payload: { hostId: session.hostId, scope: session.scope, missionId: session.missionId }
    });
  });
  return getSession(db, session.holobiontId);
}

async function appendEvent(db, input) {
  const eventType = String(input.eventType || '');
  if (!EVENT_TYPES.includes(eventType)) throw Object.assign(new Error('Unknown Holobiont event type.'), { code: 'HOLOBIONT_EVENT_INVALID' });
  const payload = input.payload === undefined ? {} : input.payload;
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw Object.assign(new Error('Holobiont event payload must be a JSON object.'), { code: 'HOLOBIONT_EVENT_INVALID' });
  }
  return withTransaction(db, (tx) => appendEventRow(tx, { ...input, eventType, payload }));
}

async function getSession(db, holobiontId) {
  const row = await db.get('SELECT session_json, revision, status FROM holobiont_sessions WHERE holobiont_id = ?', holobiontId);
  const session = parseSession(row);
  if (!session) return null;
  session.events = await listEvents(db, holobiontId);
  return session;
}

async function listEvents(db, holobiontId) {
  const rows = await db.all(`SELECT event_id AS eventId, revision, event_type AS eventType,
    payload_json AS payloadJson, actor_id AS actorId, occurred_at AS occurredAt
    FROM holobiont_events WHERE holobiont_id = ? ORDER BY revision`, holobiontId);
  return rows.map((row) => ({ ...row, payload: JSON.parse(row.payloadJson), payloadJson: undefined }));
}

module.exports = { createSession, appendEvent, getSession, listEvents, reduceEvent };
