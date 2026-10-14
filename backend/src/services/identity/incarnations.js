'use strict';

const crypto = require('crypto');
const { withTransaction } = require('../../db');
const store = require('./storage');
const ledger = require('./ledger');

function sessionOf(head, key) {
  return { agentId: head.agent_id, incarnationId: head.incarnation_id,
    fencingToken: head.fencing_token, ownerId: head.owner_id, leaseUntil: head.lease_until,
    scope: { organizationId: head.organization_id, projectId: head.project_id }, key };
}

async function activate(db, input) {
  await ledger.ensure(db, input);
  if (!(await ledger.verify(db, input.agentId)).valid) store.fail('IDENTITY_CHAIN_UNVERIFIED');
  if (!input.ownerId) store.fail('IDENTITY_OWNER_REQUIRED');
  return withTransaction(db, async () => {
    store.assertActive(await store.registration(db, input));
    const head = await store.head(db, input.agentId);
    if (head.life_state === 'terminal') store.fail('IDENTITY_TERMINAL');
    const now = Date.now();
    if (head.lease_until > now && head.owner_id !== input.ownerId) store.fail('IDENTITY_ALREADY_ACTIVE');
    const ttl = Math.min(900000, Math.max(1000, input.ttlMs || 60000));
    if (head.lease_until > now) {
      assertKey(head, input.session);
      await db.run('UPDATE agent_identity_heads SET lease_until = ? WHERE agent_id = ?', now + ttl, input.agentId);
      return sessionOf({ ...head, lease_until: now + ttl }, input.session.key);
    }
    const incarnation = crypto.randomUUID();
    const key = crypto.randomBytes(32).toString('hex');
    await ledger.append(db, { agentId: input.agentId, expectedRevision: head.revision,
      type: 'ACTIVATE', operationId: `activate:${incarnation}`, payload: {
        incarnationId: incarnation, ownerId: input.ownerId, fencingToken: head.fencing_token + 1 } });
    await db.run(`UPDATE agent_identity_heads SET incarnation_id = ?, owner_id = ?,
      fencing_token = fencing_token + 1, lease_until = ?, session_key_hash = ? WHERE agent_id = ?`,
    incarnation, input.ownerId, now + ttl, store.hash(key), input.agentId);
    return sessionOf(await store.head(db, input.agentId), key);
  });
}

async function assertSession(db, session) {
  if (!session?.agentId) store.fail('IDENTITY_SESSION_PROOF_REQUIRED');
  return withTransaction(db, () => checkSession(db, session));
}

async function checkSession(db, session) {
  const registration = await store.registration(db, { agentId: session.agentId, scope: session.scope });
  store.assertActive(registration);
  const head = await ledger.ensure(db, { agentId: session.agentId, scope: session.scope });
  if (head.life_state === 'terminal') store.fail('IDENTITY_TERMINAL');
  if (!head || head.incarnation_id !== session.incarnationId || head.fencing_token !== session.fencingToken
    || head.owner_id !== session.ownerId || head.lease_until <= Date.now()) store.fail('IDENTITY_SESSION_STALE');
  assertKey(head, session);
  return head;
}

function assertKey(head, session) {
  if (!session?.key || store.hash(session.key) !== head.session_key_hash) store.fail('IDENTITY_SESSION_PROOF_REQUIRED');
}

async function release(db, session) {
  return withTransaction(db, async () => {
    const head = await store.head(db, session.agentId);
    if (!head || head.incarnation_id !== session.incarnationId || head.fencing_token !== session.fencingToken
      || head.owner_id !== session.ownerId) store.fail('IDENTITY_SESSION_STALE');
    assertKey(head, session);
    await ledger.append(db, { agentId: session.agentId, expectedRevision: head.revision,
      type: 'RELEASE', operationId: `release:${session.incarnationId}`, payload: { incarnationId: session.incarnationId } });
    await db.run('UPDATE agent_identity_heads SET lease_until = 0, owner_id = NULL WHERE agent_id = ?', session.agentId);
  });
}

module.exports = { activate, assertSession, release, sessionOf };
