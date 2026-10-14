'use strict';

const crypto = require('crypto');
const { withTransaction } = require('../../db');
const store = require('./storage');
const ledger = require('./ledger');
const incarnations = require('./incarnations');

async function secret(db) {
  await db.run("INSERT OR IGNORE INTO agent_identity_keys(key_id, secret) VALUES ('runtime-v1', ?)",
    crypto.randomBytes(32).toString('hex'));
  return (await db.get("SELECT secret FROM agent_identity_keys WHERE key_id = 'runtime-v1'")).secret;
}

function signature(key, body) {
  return crypto.createHmac('sha256', key).update(JSON.stringify(store.canonical(body))).digest('hex');
}

async function present(db, input) {
  return withTransaction(db, async () => {
    const head = await incarnations.assertSession(db, input.session);
    const registration = await store.registration(db, { agentId: head.agent_id });
    await ledger.ensure(db, { agentId: input.audienceId, scope: input.session.scope });
    const body = { agentId: head.agent_id, incarnationId: head.incarnation_id,
      fencingToken: head.fencing_token, headHash: head.head_hash, revision: head.revision,
      scope: input.session.scope, name: registration.name, role: registration.role, kind: registration.kind,
      audienceId: input.audienceId, nonce: crypto.randomUUID(),
      expiresAt: Math.min(head.lease_until, Date.now() + 30000) };
    return { body, signature: signature(await secret(db), body) };
  });
}

async function verifyPresentation(db, input) {
  const body = await authenticatedBody(db, input);
  if (body.audienceId !== input.observerId || body.expiresAt <= Date.now()) store.fail('IDENTITY_PRESENTATION_EXPIRED');
  await ledger.ensure(db, { agentId: input.observerId, scope: body.scope });
  const head = await ledger.ensure(db, { agentId: body.agentId, scope: body.scope });
  store.assertActive(await store.registration(db, { agentId: body.agentId, scope: body.scope }));
  if (head.incarnation_id !== body.incarnationId || head.fencing_token !== body.fencingToken
    || head.head_hash !== body.headHash || head.lease_until <= Date.now()) store.fail('IDENTITY_PRESENTATION_STALE');
  if (body.agentId === input.observerId) store.fail('IDENTITY_SELF_IS_NOT_PEER');
  return head;
}

async function authenticatedBody(db, input) {
  const presentation = input.presentation;
  if (!presentation?.body || !/^[a-f0-9]{64}$/.test(presentation.signature || '')) store.fail('IDENTITY_PRESENTATION_INVALID');
  const body = presentation.body;
  const expected = signature(await secret(db), body);
  if (!crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(presentation.signature, 'hex'))) {
    store.fail('IDENTITY_PRESENTATION_INVALID');
  }
  return body;
}

async function recognize(db, input) {
  await store.ready(db);
  return withTransaction(db, async () => {
    const prior = await previousEncounter(db, input);
    if (prior) return prior;
    const peer = await verifyPresentation(db, input);
    const observation = await ledger.transition(db, { agentId: input.observerId, type: 'OBSERVE',
      operationId: `encounter:${input.operationId}`, payload: { peerId: peer.agent_id,
        presentationHash: store.hash(input.presentation) }, causalRefs: [peer.head_hash] });
    const observer = await store.head(db, input.observerId);
    await saveClaim(db, { observerId: input.observerId, peerId: peer.agent_id,
      key: 'identity', source: 'registry', value: input.presentation.body,
      evidenceHash: observer.head_hash, confidence: 1 });
    const receipt = { peerId: peer.agent_id, selfHead: observer.head_hash, peerHead: peer.head_hash,
      observationRevision: observation.revision, verified: true };
    await db.run(`INSERT INTO agent_identity_encounters
      (observer_id, nonce, operation_id, presentation_hash, receipt_json) VALUES (?, ?, ?, ?, ?)`,
    input.observerId, input.presentation.body.nonce, input.operationId, store.hash(input.presentation), JSON.stringify(receipt));
    return receipt;
  });
}

async function previousEncounter(db, input) {
  const prior = await db.get(`SELECT * FROM agent_identity_encounters
    WHERE observer_id = ? AND (operation_id = ? OR nonce = ?)`, input.observerId,
  input.operationId, input.presentation?.body?.nonce || '');
  if (!prior) return null;
  if (prior.operation_id !== input.operationId || prior.presentation_hash !== store.hash(input.presentation)) {
    store.fail('IDENTITY_PRESENTATION_REPLAY');
  }
  return JSON.parse(prior.receipt_json);
}

async function saveClaim(db, claim) {
  await db.run(`INSERT INTO agent_identity_peer_claims
    (observer_id, peer_id, claim_key, source_kind, value_json, evidence_hash, confidence, observed_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(observer_id, peer_id, claim_key, source_kind)
    DO UPDATE SET value_json = excluded.value_json, evidence_hash = excluded.evidence_hash,
      confidence = excluded.confidence, observed_at = excluded.observed_at`,
  claim.observerId, claim.peerId, claim.key, claim.source, JSON.stringify(claim.value),
  claim.evidenceHash, claim.confidence ?? null, new Date().toISOString());
}

async function observe(db, input) {
  if (!['declared', 'observed', 'inferred'].includes(input.source)) store.fail('IDENTITY_CLAIM_SOURCE_INVALID');
  return withTransaction(db, async () => {
    const observer = await ledger.ensure(db, { agentId: input.observerId });
    const scope = { organizationId: observer.organization_id, projectId: observer.project_id };
    await ledger.ensure(db, { agentId: input.peerId, scope });
    const evidence = await db.get('SELECT agent_id FROM agent_identity_events WHERE event_hash = ?', input.evidenceHash);
    if (!evidence || ![input.peerId, input.observerId].includes(evidence.agent_id)) store.fail('IDENTITY_EVIDENCE_REQUIRED');
    await saveClaim(db, input);
  });
}

async function model(db, input) {
  const observer = await ledger.ensure(db, { agentId: input.observerId });
  await ledger.ensure(db, { agentId: input.peerId,
    scope: { organizationId: observer.organization_id, projectId: observer.project_id } });
  const rows = await db.all(`SELECT * FROM agent_identity_peer_claims WHERE observer_id = ? AND peer_id = ?
    ORDER BY claim_key, source_kind`, input.observerId, input.peerId);
  return { observerId: input.observerId, peerId: input.peerId, claims: rows.map(row => ({
    key: row.claim_key, source: row.source_kind, value: JSON.parse(row.value_json),
    evidenceHash: row.evidence_hash, confidence: row.confidence, observedAt: row.observed_at })) };
}

// Internal admission only: the caller must already have verified the RPE grant.
async function recognizeRegistered(db, input) {
  const observer = await ledger.ensure(db, { agentId: input.observerId, scope: input.scope });
  store.assertActive(await store.registration(db, { agentId: input.observerId, scope: input.scope }));
  const peer = await ledger.ensure(db, { agentId: input.peerId, scope: input.scope });
  if (observer.life_state === 'terminal' || peer.life_state === 'terminal') store.fail('IDENTITY_TERMINAL');
  const registration = await store.registration(db, { agentId: input.peerId, scope: input.scope });
  store.assertActive(registration);
  const value = { agentId: peer.agent_id, headHash: peer.head_hash, revision: peer.revision,
    scope: input.scope, name: registration.name, role: registration.role, kind: registration.kind,
    expiresAt: Date.now() + 30000, evidenceClass: 'authorized_registry_route' };
  await ledger.append(db, { agentId: observer.agent_id, expectedRevision: observer.revision,
    type: 'RELATE', operationId: `route:${input.operationId}`, payload: value, causalRefs: [peer.head_hash] });
  const current = await store.head(db, input.observerId);
  await saveClaim(db, { observerId: input.observerId, peerId: input.peerId, key: 'identity',
    source: 'registry', value, evidenceHash: current.head_hash, confidence: 1 });
  return { observerId: input.observerId, peerId: input.peerId, selfHead: current.head_hash,
    peerHead: peer.head_hash, evidenceClass: value.evidenceClass };
}

module.exports = { present, recognize, observe, model, verifyPresentation, recognizeRegistered };
