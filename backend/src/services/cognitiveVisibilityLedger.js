'use strict';

const crypto = require('node:crypto');

function keyOf(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function createLedger() {
  const sessions = new Map();
  function sessionOf(sessionId) {
    if (!sessionId || typeof sessionId !== 'string') throw new Error('visibility_session_required');
    if (!sessions.has(sessionId)) sessions.set(sessionId, { revision: 0, objects: new Map() });
    return sessions.get(sessionId);
  }
  function materialize(input = {}) {
    const session = sessionOf(input.sessionId);
    const objectId = input.objectId || keyOf(input.value);
    createLedgerValues(session, objectId, input);
    return { objectId, revision: session.revision, mode: 'materialized' };
  }
  function invalidate(input = {}) {
    const session = sessionOf(input.sessionId);
    session.revision += 1;
    const ids = input.objectIds || [...session.objects.keys()];
    ids.forEach((id) => { if (session.objects.has(id)) session.objects.get(id).valid = false; });
    return { revision: session.revision, invalidated: ids };
  }
  function visible(input = {}) {
    const session = sessionOf(input.sessionId);
    const entry = session.objects.get(input.objectId);
    const expires = typeof entry?.expiresAt === 'string' ? Date.parse(entry.expiresAt) : entry?.expiresAt;
    const fresh = createLedgerFresh(entry, input, expires);
    return { visible: Boolean(fresh), revision: session.revision,
      value: fresh ? entry.value : undefined };
  }
  return { materialize, invalidate, visible, reset: (sessionId) => sessions.delete(sessionId) };
}

module.exports = { createLedger };

function createLedgerFresh(entry, input, expires) {
  return entry && entry.valid && entry.scope === (input.scope ?? null)
      && (!entry.expiresAt || expires > Date.now());
}

function createLedgerValues(session, objectId, input) {
  return session.objects.set(objectId, { value: input.value, revision: session.revision, scope: input.scope ?? null,
      expiresAt: input.expiresAt || null, valid: true });
}
