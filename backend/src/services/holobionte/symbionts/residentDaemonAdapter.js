'use strict';

const store = require('../holobiontStore');

function requiredText(value, field) {
  const text = String(value || '').trim();
  if (!text) throw Object.assign(new Error(`${field} is required.`), { code: 'HOLOBIONT_DAEMON_INVALID' });
  return text;
}

function daemonIdentity(input) {
  const daemonId = requiredText(input.daemonId, 'daemonId');
  if (!/^daemon\.[a-z0-9]+(?:-[a-z0-9]+)*$/i.test(daemonId)) {
    throw Object.assign(new Error('daemonId has an invalid format.'), { code: 'HOLOBIONT_DAEMON_INVALID' });
  }
  return daemonId;
}

function daemonCapabilities(value) {
  if (!Array.isArray(value) || !value.length) {
    throw Object.assign(new Error('A resident daemon must declare capabilities.'), { code: 'HOLOBIONT_DAEMON_INVALID' });
  }
  return [...new Set(value.map((item) => requiredText(item, 'capability')))];
}

function daemonEvidence(value) {
  if (!Array.isArray(value) || !value.length) {
    throw Object.assign(new Error('Daemon discovery requires evidence references.'), { code: 'HOLOBIONT_EVIDENCE_REQUIRED' });
  }
  return [...new Set(value.map((item) => requiredText(item, 'evidence reference')))];
}

async function registerResidentDaemon(db, input = {}) {
  const session = await store.getSession(db, input.holobiontId);
  if (!session) throw Object.assign(new Error('Holobiont session not found.'), { code: 'HOLOBIONT_SESSION_NOT_FOUND' });
  if (session.scope !== 'PERSISTENT') {
    throw Object.assign(new Error('Resident daemons require a persistent Host.'), { code: 'HOLOBIONT_PERSISTENT_HOST_REQUIRED' });
  }
  if (Number(input.expectedSessionRevision) !== session.revision) {
    throw Object.assign(new Error('Holobiont revision conflict.'), { code: 'HOLOBIONT_REVISION_CONFLICT' });
  }
  const daemonId = daemonIdentity(input);
  const evidenceRefs = daemonEvidence(input.evidenceRefs);
  const symbiontId = `daemon:${daemonId}`;
  const exists = [...session.residentSymbionts, ...session.candidateSymbionts].some((item) => item.id === symbiontId);
  if (exists) throw Object.assign(new Error('Daemon is already registered with this Host.'), { code: 'HOLOBIONT_DAEMON_ALREADY_REGISTERED' });
  const symbiont = {
    kind: 'DAEMON', daemonId, territoryId: requiredText(input.territoryId, 'territoryId'),
    name: requiredText(input.name, 'name'), capabilities: daemonCapabilities(input.capabilities),
    cadence: 'LOW_FREQUENCY', executionLocal: true, scope: 'PERSISTENT', evidenceRefs
  };
  const revision = await store.appendEvent(db, {
    holobiontId: session.holobiontId, expectedRevision: session.revision,
    eventType: 'SYMBIONT_DISCOVERED', actorId: input.actorId,
    payload: { symbiontId, symbiont }
  });
  return { symbiontId, kind: symbiont.kind, status: 'CANDIDATE', sessionRevision: revision, evidenceRefs };
}

module.exports = { registerResidentDaemon };
