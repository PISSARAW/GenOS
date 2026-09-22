'use strict';

/**
 * Point 1 (P0) : test end-to-end sur une vraie base SQLite, sans mock.
 * fresh DB -> initializeSchema (CREATE TABLE + migrations) -> seed ->
 * createCommit() -> storeObject() doit réussir avec les colonnes crypto.
 *
 * Historique : storeObjectHelper.cjs insère signature_algorithm /
 * author_key_id / public_key_fingerprint / signed_commit_envelope ; si le
 * schéma initial ou les migrations ne créent pas ces colonnes, l'INSERT
 * échoue avec "table agent_git_objects has no column named ...". Les mocks
 * des autres suites ne valident pas le SQL réel, d'où ce test.
 */

const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');

process.env.NODE_ENV = 'test';

const dbModule = require('../src/db');
const agentGit = require('../src/services/agentGitService');

const DB_PATH = path.join(os.tmpdir(), `genos-agent-git-e2e-${Date.now()}-${process.pid}.db`);

function makeReq() {
  return { user: { username: 'e2e-tester' }, tenant: null, body: {}, ip: '127.0.0.1' };
}

async function ensureAgent(db) {
  const existing = await db.get('SELECT id FROM agents WHERE id = ?', 'agent-e2e-1');
  if (existing) return;
  const workspaces = await db.all('SELECT id FROM workspaces LIMIT 1');
  const workspaceId = workspaces[0]?.id || null;
  await db.run(
    'INSERT INTO agents (id, workspace_id, name, role, status, cognitive_budget, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    'agent-e2e-1', workspaceId, 'AgentE2E', 'worker', 'idle', 50, new Date().toISOString()
  );
}

async function main() {
  const db = await dbModule.getDatabase(DB_PATH);
  await ensureAgent(db);

  // Le schéma réel doit exposer les 4 colonnes crypto après initialisation.
  const columns = (await db.all('PRAGMA table_info(agent_git_objects)')).map((c) => c.name);
  for (const expected of ['signature_algorithm', 'author_key_id', 'public_key_fingerprint', 'signed_commit_envelope']) {
    assert.ok(columns.includes(expected), `agent_git_objects doit avoir la colonne ${expected} (colonnes: ${columns.join(', ')})`);
  }

  // createCommit sur une vraie base : INSERT complet + ref + reflog.
  const req = makeReq();
  const commit = await agentGit.createCommit(req, { agentId: 'agent-e2e-1', refName: 'main', metadata: { message: 'e2e point 1' } });
  assert.ok(commit.id, 'createCommit doit retourner un id');
  assert.ok(commit.commitHash, 'createCommit doit retourner un commitHash');
  assert.ok(commit.treeHash, 'createCommit doit retourner un treeHash');
  assert.ok(commit.signature, 'createCommit doit retourner une signature');

  // L'objet persisté doit contenir les colonnes crypto peuplées.
  const stored = await db.get('SELECT * FROM agent_git_objects WHERE id = ?', commit.id);
  assert.ok(stored, 'le commit doit être persisté');
  assert.equal(stored.signature_algorithm, 'hmac-sha256', 'signature_algorithm doit être persisté');
  assert.ok(stored.signed_commit_envelope, 'signed_commit_envelope doit être persisté');
  assert.equal(stored.commit_hash, commit.commitHash, 'commit_hash persisté = commitHash retourné');
  assert.equal(stored.tree_hash, commit.treeHash, 'tree_hash persisté = treeHash retourné');

  // La ref main doit pointer sur le commit.
  const ref = await db.get('SELECT object_id FROM agent_git_refs WHERE agent_id = ? AND ref_name = ?', 'agent-e2e-1', 'main');
  assert.equal(ref?.object_id, commit.id, 'la ref main doit pointer sur le commit');

  // Second commit : parent_commit_id doit être lié au premier.
  const second = await agentGit.createCommit(req, { agentId: 'agent-e2e-1', refName: 'main', metadata: { message: 'second' } });
  const secondRow = await db.get('SELECT parent_commit_id FROM agent_git_objects WHERE id = ?', second.id);
  assert.equal(secondRow?.parent_commit_id, commit.id, 'le second commit doit avoir le premier comme parent');

  // show() doit relire l'objet avec la signature marquée valide (HMAC dev).
  const shown = await agentGit.show({ ...makeReq(), body: { objectId: commit.id } });
  assert.ok(shown.success, 'show doit réussir');
  assert.equal(shown.object.signatureValid, true, 'la signature du commit doit se vérifier via show()');

  console.log('[OK] point 1 - SQLite réel : schéma crypto complet, createCommit + parent + signature vérifiés');
  console.log(`     commit=${commit.id} commitHash=${commit.commitHash.slice(0, 12)}…`);
}

main()
  .then(async () => {
    await dbModule.closeDatabase();
    for (const suffix of ['', '-wal', '-shm']) {
      fs.rmSync(DB_PATH + suffix, { force: true });
    }
    process.exit(0);
  })
  .catch(async (err) => {
    console.error('[FAIL] point 1 :', err.message);
    console.error(err.stack);
    try { await dbModule.closeDatabase(); } catch (_) {}
    process.exit(1);
  });
