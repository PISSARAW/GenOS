'use strict';

const assert = require('node:assert/strict');
const ledger = require('../src/services/identity/ledger');
const store = require('../src/services/identity/storage');
const incarnations = require('../src/services/identity/incarnations');
const peers = require('../src/services/identity/peers');
const decisions = require('../src/services/identity/decisions');
const checkpoints = require('../src/services/identity/checkpoints');
const boundary = require('../src/services/identity/modelBoundary');
const snapshots = require('../src/services/identity/snapshots');

async function database() {
  const db = await require('sqlite').open({ filename: ':memory:', driver: require('sqlite3').Database });
  await db.exec(`CREATE TABLE workspaces (id TEXT PRIMARY KEY, organization_id TEXT, project_id TEXT);
    CREATE TABLE agents (id TEXT PRIMARY KEY, name TEXT, role TEXT, execution_mode TEXT, status TEXT,
      workspace_id TEXT, model_tier TEXT, parent_agent_id TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
    INSERT INTO workspaces VALUES ('w', 'org', 'project'), ('elsewhere', 'other', 'project');
    INSERT INTO agents(id, status, workspace_id) VALUES ('legacy', 'idle', 'w');`);
  await store.ready(db);
  for (const id of ['a', 'b', 'child', 'outsider']) {
    await db.run(`INSERT INTO agents(id, name, role, execution_mode, status, workspace_id, model_tier)
      VALUES (?, 'same-name', 'worker', 'worker', 'idle', ?, 'same-model')`, id, id === 'outsider' ? 'elsewhere' : 'w');
  }
  return db;
}

async function continuity(db) {
  assert.equal((await ledger.ensure(db, { agentId: 'legacy' })).revision, 1);
  assert.equal((await ledger.verify(db, 'legacy')).origin, 'LEGACY_IMPORT');
  const first = await ledger.ensure(db, { agentId: 'a' });
  assert.equal((await ledger.verify(db, 'a')).origin, 'GENESIS');
  await db.run("UPDATE agents SET name = 'new-name', model_tier = 'new-model' WHERE id = 'a'");
  const changed = await ledger.ensure(db, { agentId: 'a' });
  assert.equal(changed.agent_id, first.agent_id);
  assert.equal(changed.revision, first.revision + 1);
  const attempts = await Promise.allSettled(['one', 'two'].map(operationId => ledger.append(db, {
    agentId: 'a', expectedRevision: changed.revision, type: 'OBSERVE', operationId })));
  assert.equal(attempts.filter(item => item.status === 'fulfilled').length, 1);
  assert.equal(attempts.find(item => item.status === 'rejected').reason.code, 'IDENTITY_REVISION_CONFLICT');
  await assert.rejects(() => db.run("UPDATE agent_identity_events SET body_json = '{}'"), /IMMUTABLE/);
  assert.equal((await ledger.verify(db, 'a')).valid, true);
}

async function fencing(db) {
  const session = await incarnations.activate(db, { agentId: 'a', ownerId: 'first' });
  await assert.rejects(() => incarnations.assertSession(db, { ...session, key: 'forged' }), /PROOF_REQUIRED/);
  await assert.rejects(() => incarnations.activate(db, { agentId: 'a', ownerId: 'copy' }), /ALREADY_ACTIVE/);
  await incarnations.release(db, session);
  const next = await incarnations.activate(db, { agentId: 'a', ownerId: 'second' });
  assert.notEqual(session.incarnationId, next.incarnationId);
  assert.equal(next.fencingToken, session.fencingToken + 1);
  await assert.rejects(() => incarnations.assertSession(db, session), /SESSION_STALE/);
  await assert.rejects(() => snapshots.assertRestorable(db, 'a'), /ACTIVE_DURING_RESTORE/);
  await incarnations.release(db, next);
}

async function leaseRenewal(db) {
  const originalNow = Date.now;
  let now = originalNow();
  Date.now = () => now;
  try {
    const session = await incarnations.activate(db, { agentId: 'outsider', ownerId: 'long-worker', ttlMs: 1000 });
    now += 800;
    const identity = { session };
    await require('../src/services/identity/worker').renew(db, identity);
    assert.equal(identity.session.leaseUntil, now + 900000);
    assert.equal((await store.head(db, 'outsider')).lease_until, identity.session.leaseUntil);
    await assert.rejects(() => incarnations.renew(db, { ...identity.session, key: 'forged' }), /PROOF_REQUIRED/);
    now += 1500;
    await incarnations.assertSession(db, identity.session);
    await incarnations.release(db, identity.session);
    await assert.rejects(() => incarnations.renew(db, identity.session), /SESSION_STALE/);
  } finally { Date.now = originalNow; }
}

async function social(db) {
  const a = await incarnations.activate(db, { agentId: 'a', ownerId: 'social-a' });
  const b = await incarnations.activate(db, { agentId: 'b', ownerId: 'social-b' });
  const presentation = await peers.present(db, { session: b, audienceId: 'a' });
  const forged = { ...presentation, body: { ...presentation.body, agentId: 'a' } };
  await assert.rejects(() => peers.recognize(db, { observerId: 'a', presentation: forged, operationId: 'forged' }), /INVALID/);
  await assert.rejects(() => peers.present(db, { session: b, audienceId: 'outsider' }), /SCOPE/);
  const receipt = await peers.recognize(db, { observerId: 'a', presentation, operationId: 'meet-b' });
  assert.equal(receipt.peerId, 'b');
  assert.deepEqual(await peers.recognize(db, { observerId: 'a', presentation, operationId: 'meet-b' }), receipt);
  await assert.rejects(() => peers.recognize(db, { observerId: 'a', presentation, operationId: 'replayed' }), /REPLAY/);
  const model = await peers.model(db, { observerId: 'a', peerId: 'b' });
  assert.equal(model.claims[0].source, 'registry');
  await peers.observe(db, { observerId: 'a', peerId: 'b', key: 'skill', source: 'declared',
    value: 'expert', evidenceHash: receipt.selfHead, confidence: 0.3 });
  await peers.observe(db, { observerId: 'a', peerId: 'b', key: 'skill', source: 'observed',
    value: 'unproven', evidenceHash: receipt.selfHead, confidence: 0.8 });
  const distinctions = await peers.model(db, { observerId: 'a', peerId: 'b' });
  assert.equal(distinctions.claims.filter(item => item.key === 'skill').length, 2);
  assert.equal((await peers.model(db, { observerId: 'b', peerId: 'a' })).claims.length, 0);
  await assert.rejects(() => peers.observe(db, { observerId: 'a', peerId: 'b', key: 'authority',
    source: 'registry', value: true, evidenceHash: receipt.selfHead }), /SOURCE_INVALID/);
  await decisions.begin(db, { session: a, operationId: 'delegate-b', domain: 'delegation', peerId: 'b', dimensions: ['relations'] });
  const fresh = await peers.present(db, { session: b, audienceId: 'a' });
  await incarnations.release(db, b);
  await assert.rejects(() => peers.recognize(db, { observerId: 'a', presentation: fresh, operationId: 'old-b' }), /STALE/);
  await incarnations.release(db, a);
}

async function learning(db) {
  const session = await incarnations.activate(db, { agentId: 'a', ownerId: 'learn' });
  for (let index = 0; index < 4; index++) {
    const operationId = `task:${index}`;
    const decision = await decisions.begin(db, { session, operationId, domain: 'worker', dimensions: ['characteristics'] });
    assert.equal(decision.agent_id, 'a');
    await decisions.finish(db, { session, operationId, success: false, attribution: 'self', evidenceRef: `oracle:${index}` });
  }
  const model = await decisions.selfModel(db, { agentId: 'a' });
  assert.equal(model.capabilities[0].observations, 4);
  assert.equal(model.capabilities[0].successProbability, 1 / 6);
  const result = await boundary.run({ db, agentId: 'a', identitySession: session, cognitiveIntegration: 'worker' }, async input => {
    assert(input.cognitiveUncertainty > 0.8);
    return { text: 'actual model boundary reached' };
  });
  assert.equal(result.identity.uncertaintyApplied, 5 / 6);
  assert.equal((await decisions.selfModel(db, { agentId: 'b' })).capabilities.length, 0);
  await incarnations.release(db, session);
}

async function branching(db) {
  await db.run("UPDATE agents SET parent_agent_id = 'a' WHERE id = 'child'");
  const anchor = await checkpoints.seal(db, { agentId: 'a', checkpointId: 'snapshot-a', contentHash: 'sealed-content', coverage: ['workspace'] });
  await checkpoints.fork(db, { parentId: 'a', childId: 'child', checkpointId: 'snapshot-a' });
  const child = await ledger.verify(db, 'child');
  assert.equal(child.valid, true);
  const origin = await db.get("SELECT body_json FROM agent_identity_events WHERE agent_id = 'child' AND event_type = 'FORK_ORIGIN'");
  const body = JSON.parse(origin.body_json);
  assert.equal(body.payload.inheritedExperience, 'inherited');
  assert.equal(body.causalRefs[0], anchor.head_hash);
  const oldHead = await store.head(db, 'a');
  await snapshots.restored(db, { agentId: 'a', state: { _genosSnapshot: { organismSnapshot: { hash: 'sealed-content', components: { workspace: {} } } } }, operationId: 'restore-a' });
  const newHead = await store.head(db, 'a');
  assert(newHead.revision > oldHead.revision);
  const restored = await db.get("SELECT body_json FROM agent_identity_events WHERE agent_id = 'a' AND event_type = 'RESTORE'");
  assert.equal(JSON.parse(restored.body_json).payload.externalEffectsReverted, false);
  assert.equal((await ledger.verify(db, 'a')).valid, true);
}

async function memories(db) {
  await db.exec(`CREATE TABLE autobiographical_episodes (id TEXT PRIMARY KEY, agent_id TEXT, mission_id TEXT,
    kind TEXT, organization_id TEXT, project_id TEXT, salience REAL, situation_json TEXT, decision_json TEXT,
    action_json TEXT, outcome_json TEXT, lesson_json TEXT, is_forgotten INTEGER DEFAULT 0, created_at TEXT);`);
  const episodes = require('../src/services/autobiographicalMemory/episodeStore');
  const original = await episodes.recordEpisode({ id: 'episode-a', agentId: 'a', kind: 'action' }, db);
  assert.equal(original.provenance.experiencedBy, 'a');
  const inherited = await episodes.recordEpisode({ agentId: 'child', inheritedFromEpisodeId: original.id }, db);
  assert.equal(inherited.agentId, 'child');
  assert.equal(inherited.provenance.experiencedBy, 'a');
  assert.equal(inherited.provenance.kind, 'inherited');
  const reInherited = await episodes.recordEpisode({ agentId: 'b', inheritedFromEpisodeId: inherited.id }, db);
  assert.equal(reInherited.provenance.experiencedBy, 'a');
  await assert.rejects(() => episodes.recordEpisode({ agentId: 'outsider', inheritedFromEpisodeId: original.id }, db), /SCOPE/);
}

async function lifecycle(db) {
  await db.run("INSERT INTO agents(id, status, workspace_id) VALUES ('disposable', 'idle', 'w')");
  await ledger.ensure(db, { agentId: 'disposable' });
  await db.run("UPDATE agents SET status = 'terminated' WHERE id = 'disposable'");
  await ledger.ensure(db, { agentId: 'disposable' });
  await db.run("UPDATE agents SET status = 'idle' WHERE id = 'disposable'");
  await assert.rejects(() => incarnations.activate(db, { agentId: 'disposable', ownerId: 'revive' }), /TERMINAL/);
  await assert.rejects(() => db.run("UPDATE agents SET id = 'new-id' WHERE id = 'disposable'"), /IMMUTABLE/);
  await db.run("DELETE FROM agents WHERE id = 'disposable'");
  assert.equal((await ledger.verify(db, 'disposable')).valid, true);
  await assert.rejects(() => db.run("INSERT INTO agents(id) VALUES ('disposable')"), /ID_REUSE/);
  await db.run("INSERT OR REPLACE INTO agents(id, status, workspace_id) VALUES ('b', 'idle', 'w')");
  await assert.rejects(() => incarnations.activate(db, { agentId: 'b', ownerId: 'replace' }), /TERMINAL/);
}

async function main() {
  const db = await database();
  try {
    for (const test of [continuity, fencing, leaseRenewal, social, learning, branching, memories, lifecycle]) await test(db);
    console.log('Identity v2: causal history, fencing, recognition, learning, forks, restore and inherited memories passed.');
  } finally { await db.close(); }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
