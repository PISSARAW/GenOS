'use strict';

const assert = require('node:assert/strict');
const { open } = require('sqlite');
const sqlite3 = require('sqlite3');
const ledger = require('../src/services/identity/ledger');
const store = require('../src/services/identity/storage');
const incarnations = require('../src/services/identity/incarnations');
const peers = require('../src/services/identity/peers');
const decisions = require('../src/services/identity/decisions');

const WORKSPACE = { id: 'w', organization_id: 'org', project_id: 'project' };
const SCOPE = { organizationId: 'org', projectId: 'project' };

async function database() {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  await db.exec(`CREATE TABLE workspaces (id TEXT PRIMARY KEY, organization_id TEXT, project_id TEXT);
    CREATE TABLE agents (id TEXT PRIMARY KEY, name TEXT, role TEXT, execution_mode TEXT, status TEXT,
      workspace_id TEXT, model_tier TEXT, parent_agent_id TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP);`);
  await db.run('INSERT INTO workspaces VALUES (?, ?, ?)', WORKSPACE.id, WORKSPACE.organization_id, WORKSPACE.project_id);
  await store.ready(db);
  for (const id of ['a', 'b', 'c']) {
    await db.run(`INSERT INTO agents(id, name, role, execution_mode, status, workspace_id, model_tier)
      VALUES (?, ?, 'worker', 'worker', 'idle', ?, 'same-model')`, id, id, WORKSPACE.id);
    await ledger.ensure(db, { agentId: id, scope: SCOPE });
  }
  return db;
}

async function sessionFor(db, agentId, ownerId) {
  return await incarnations.activate(db, { agentId, ownerId, ttlMs: 900000 });
}

async function main() {
  const db = await database();
  try {
    // 1. a rencontre b : reconnaissance verifiee par identite (pas par nom)
    const sa = await sessionFor(db, 'a', 'social-a');
    const sb = await sessionFor(db, 'b', 'social-b');
    const presentationB = await peers.present(db, { session: sb, audienceId: 'a' });
    assert.equal(presentationB.body.agentId, 'b');
    const receipt = await peers.recognize(db, { observerId: 'a', presentation: presentationB, operationId: 'meet-b' });
    assert.equal(receipt.peerId, 'b');
    assert.equal(receipt.verified, true);
    assert.equal(receipt.selfHead, receipt.selfHead);
    assert.equal(receipt.peerHead, receipt.peerHead);

    // Le claim registry porte le nom d'origine de b
    const modelBefore = await peers.model(db, { observerId: 'a', peerId: 'b' });
    const registryClaim = modelBefore.claims.find(item => item.source === 'registry' && item.key === 'identity');
    assert.ok(registryClaim, 'claim registry present');
    assert.equal(registryClaim.value.name, 'b');

    // 2. b est renomme : a doit toujours reconnaitre le meme pair (meme peerId, meme incarnation)
    await db.run("UPDATE agents SET name = 'renomme' WHERE id = 'b'");
    await ledger.ensure(db, { agentId: 'b', scope: SCOPE });
    const presentationBRenamed = await peers.present(db, { session: sb, audienceId: 'a' });
    assert.equal(presentationBRenamed.body.agentId, 'b');
    assert.equal(presentationBRenamed.body.name, 'renomme');
    assert.equal(presentationBRenamed.body.incarnationId, presentationB.body.incarnationId);
    const receiptAgain = await peers.recognize(db, {
      observerId: 'a', presentation: presentationBRenamed, operationId: 'meet-b-renamed',
    });
    assert.equal(receiptAgain.peerId, 'b');
    assert.equal(receiptAgain.verified, true);
    assert.notEqual(receiptAgain.peerHead, receipt.peerHead, 'head evolve avec le changement d etat');
    const modelAfter = await peers.model(db, { observerId: 'a', peerId: 'b' });
    const registryClaimAfter = modelAfter.claims.find(item => item.source === 'registry' && item.key === 'identity');
    assert.equal(registryClaimAfter.value.name, 'renomme');

    // 3. usurpation : c pretend etre b (body declare agentId = b mais vient de c)
    const sc = await sessionFor(db, 'c', 'social-c');
    const presentationC = await peers.present(db, { session: sc, audienceId: 'a' });
    const usurpation = { ...presentationC, body: { ...presentationC.body, agentId: 'b' } };
    await assert.rejects(() => peers.recognize(db, {
      observerId: 'a', presentation: usurpation, operationId: 'usurp-b',
    }), /PRESENTATION_INVALID/);

    // 4. declaration vs observation : registry (rencontre verifie) != observed (experience directe)
    await peers.observe(db, {
      observerId: 'a', peerId: 'b', key: 'reliability', source: 'observed',
      value: 'high', evidenceHash: receipt.selfHead, confidence: 0.9,
    });
    const modelFull = await peers.model(db, { observerId: 'a', peerId: 'b' });
    const sources = modelFull.claims.map(item => item.source);
    assert.ok(sources.includes('registry'), 'registry source present');
    assert.ok(sources.includes('observed'), 'observed source present');
    assert.equal(modelFull.claims.filter(item => item.source === 'observed').length, 1);

    await incarnations.release(db, sa);
    await incarnations.release(db, sb);
    await incarnations.release(db, sc);
    console.log('Recognize renamed peer: PASS');
  } finally {
    await db.close();
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
