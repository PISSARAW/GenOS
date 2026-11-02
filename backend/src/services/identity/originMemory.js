'use strict';
const { withTransaction } = require('../../db');
const store = require('./storage');
const ledger = require('./ledger');
const lineage = require('./lineage');
const OPERATION = 'identity:origin-token';

async function read(db, input) {
  await store.ready(db);
  const registration = await store.registration(db, input);
  await ledger.ensure(db, input);
  const verified = await ledger.verify(db, input.agentId);
  if (!verified.valid) store.fail('IDENTITY_ORIGIN_UNVERIFIED');
  const row = await db.get('SELECT * FROM agent_identity_events WHERE agent_id=? AND idempotency_key=?', input.agentId, OPERATION);
  if (!row) return null;
  const body = JSON.parse(row.body_json);
  if (body.type !== 'TRANSITION' || body.payload.kind !== 'origin_token') store.fail('IDENTITY_ORIGIN_RECORD_INVALID');
  return { token: body.payload.token, eventHash: row.event_hash, scope: registration.scope };
}

async function write(db, input) {
  const head = await ledger.ensure(db, { agentId: input.agentId, scope: input.scope });
  const prior = await db.get('SELECT event_hash FROM agent_identity_events WHERE agent_id=? AND idempotency_key=?', input.agentId, OPERATION);
  if (!prior) {
    const acted = await db.get(`SELECT event_hash FROM agent_identity_events WHERE agent_id=?
      AND event_type IN ('ACTIVATE','DECIDE','OUTCOME') LIMIT 1`, input.agentId);
    if (acted) store.fail('IDENTITY_ORIGIN_BIND_AFTER_ACTIVATION');
  }
  const body = await ledger.append(db, { agentId: input.agentId, expectedRevision: head.revision,
    type: 'TRANSITION', operationId: OPERATION, payload: { kind: 'origin_token', token: input.token,
      inheritedFrom: input.inheritedFrom || null }, causalRefs: input.causalRefs || [] });
  return { token: body.payload.token, eventHash: store.hash(body), scope: body.scope };
}

async function bind(db, input) {
  if (typeof input.token !== 'string' || !/^[a-zA-Z0-9_.:-]{1,128}$/.test(input.token)) store.fail('IDENTITY_ORIGIN_TOKEN_INVALID');
  return withTransaction(db, async () => {
    await store.ready(db);
    const registration = await store.registration(db, { agentId: input.agentId });
    if (registration.parentId) store.fail('IDENTITY_ORIGIN_INHERITANCE_REQUIRED');
    return write(db, { ...input, scope: registration.scope });
  });
}

async function inherit(db, input) {
  return withTransaction(db, async () => {
    const registration = await store.registration(db, { agentId: input.agentId });
    if (registration.parentId !== input.sourceId) store.fail('IDENTITY_ORIGIN_PARENT_MISMATCH');
    const relation = await lineage.describe(db, { agentId: input.agentId, targetId: input.sourceId });
    if (relation.relation !== 'parent') store.fail('IDENTITY_ORIGIN_PARENT_UNVERIFIED');
    const source = await read(db, { agentId: input.sourceId, scope: registration.scope });
    if (!source) store.fail('IDENTITY_ORIGIN_SOURCE_MISSING');
    return write(db, { agentId: input.agentId, scope: registration.scope, token: source.token,
      inheritedFrom: input.sourceId, causalRefs: [source.eventHash] });
  });
}

async function check(db, input) {
  const origin = await read(db, { agentId: input.agentId });
  if (!origin) return { accepted: false, reason: 'ORIGIN_UNAVAILABLE', anchorHash: null };
  return { accepted: input.token === origin.token, reason: input.token === origin.token ? 'ORIGIN_MATCHED' : 'ORIGIN_MISMATCH',
    anchorHash: origin.eventHash };
}

module.exports = { bind, inherit, read, check };
