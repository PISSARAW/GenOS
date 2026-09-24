'use strict';

const { createHash } = require('crypto');
const store = require('../holobiontStore');
const syncytiumPersistence = require('../../syncytiumPersistenceService');

function text(value, field) {
  const normalized = String(value || '').trim();
  if (!normalized) throw Object.assign(new Error(`${field} is required.`), { code: 'HOLOBIONT_SYNCYTIUM_INVALID' });
  return normalized;
}

function memberList(value) {
  const members = Array.isArray(value) ? [...new Set(value.map((item) => String(item || '').trim()).filter(Boolean))] : [];
  if (members.length < 2) throw Object.assign(new Error('A Syncytium symbiont must encapsulate at least two members.'), { code: 'HOLOBIONT_SYNCYTIUM_MEMBERS_REQUIRED' });
  return members;
}

function capabilityList(value) {
  if (!Array.isArray(value) || !value.length) throw Object.assign(new Error('Syncytium capabilities are required.'), { code: 'HOLOBIONT_SYNCYTIUM_INVALID' });
  return [...new Set(value.map((item) => text(item, 'capability')))];
}

function evidenceList(value) {
  if (!Array.isArray(value) || !value.length) throw Object.assign(new Error('Syncytium integration requires evidence references.'), { code: 'HOLOBIONT_EVIDENCE_REQUIRED' });
  return [...new Set(value.map((item) => text(item, 'evidence reference')))];
}

function stateHash(session) {
  return `sha256:${createHash('sha256').update(JSON.stringify(session.state)).digest('hex')}`;
}

async function registerSyncytiumCandidate(db, input = {}) {
  const host = await store.getSession(db, input.holobiontId);
  if (!host) throw Object.assign(new Error('Holobiont session not found.'), { code: 'HOLOBIONT_SESSION_NOT_FOUND' });
  if (host.scope !== 'PERSISTENT') throw Object.assign(new Error('Syncytium symbionts require a persistent Host.'), { code: 'HOLOBIONT_PERSISTENT_HOST_REQUIRED' });
  if (Number(input.expectedSessionRevision) !== host.revision) throw Object.assign(new Error('Holobiont revision conflict.'), { code: 'HOLOBIONT_REVISION_CONFLICT' });
  const syncSessionId = text(input.syncytiumSessionId, 'syncytiumSessionId');
  const session = await syncytiumPersistence.loadSession(db, syncSessionId);
  if (!session) throw Object.assign(new Error('Persisted Syncytium session not found.'), { code: 'SYNCYTIUM_SESSION_UNKNOWN' });
  const memberIds = memberList(input.memberIds);
  const symbiontId = `syncytium:${syncSessionId}`;
  const candidate = {
    kind: 'SUB_TOPOLOGY', topology: 'syncytium', syncytiumSessionId: syncSessionId,
    memberIds, capabilities: capabilityList(input.capabilities), stateHash: stateHash(session),
    evidenceRefs: evidenceList(input.evidenceRefs), consistencyRevision: session.revision,
    cadence: 'CONTINUOUS', scope: 'PERSISTENT'
  };
  const revision = await store.appendEvent(db, {
    holobiontId: host.holobiontId, expectedRevision: host.revision,
    eventType: 'SYMBIONT_DISCOVERED', actorId: input.actorId,
    payload: { symbiontId, symbiont: candidate }
  });
  return { symbiontId, candidate, status: 'CANDIDATE', sessionRevision: revision };
}

module.exports = { registerSyncytiumCandidate };
