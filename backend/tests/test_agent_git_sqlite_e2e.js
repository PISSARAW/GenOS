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

  // --- Point 4 : computePatch/applyPatch avec REPLACE + identityOf ---
  const { computePatch } = require('../src/services/agentGitService/dagOperations');
  const fromState = {
    decisions: [{ id: 'd1', title: 'A', content: 'original' }],
    plasmids: [{ plasmid_id: 'P42', status: 'active' }],
    permissions: [{ organization_id: 'org1', project_id: 'proj1', permissions_json: '[]', denied_tools_json: '[]' }]
  };
  const toState = {
    decisions: [{ id: 'd1', title: 'A', content: 'modifié' }],           // -> REPLACE d1
    plasmids: [],                                                        // -> REMOVE P42 (via plasmid_id)
    permissions: [{ organization_id: 'org1', project_id: 'proj1', permissions_json: '["mcp:read"]', denied_tools_json: '[]' }] // -> REPLACE scope org1:proj1
  };
  const patch = computePatch(fromState, toState);
  const ops = (section) => patch.operations.filter(o => o.section === section);
  assert.equal(ops('decisions').length, 1, 'une opération decisions');
  assert.equal(ops('decisions')[0].op, 'REPLACE', 'd1 modifié => REPLACE (et non ADD+REMOVE)');
  assert.equal(ops('decisions')[0].itemId, 'd1');
  assert.equal(ops('plasmids').length, 1, 'une opération plasmids');
  assert.equal(ops('plasmids')[0].op, 'REMOVE', 'plasmide absent de toState => REMOVE');
  assert.equal(ops('plasmids')[0].itemId, 'P42', 'identité plasmid = plasmid_id');
  assert.equal(ops('permissions').length, 1, 'une opération permissions');
  assert.equal(ops('permissions')[0].op, 'REPLACE', 'permission même scope modifiée => REPLACE');
  assert.equal(ops('permissions')[0].itemId, 'org1:proj1', 'identité permission = clé de scope');

  // applyPatch doit appliquer REPLACE et REMOVE par identité de section.
  const { applyOperationToState } = require('../src/services/agentGitService/dagOperations');
  const state = JSON.parse(JSON.stringify(fromState));
  for (const op of patch.operations) applyOperationToState(state, op);
  assert.equal(state.decisions[0].content, 'modifié', 'REPLACE remplace d1 en place');
  assert.equal(state.plasmids.length, 0, 'REMOVE supprime le plasmide P42 via plasmid_id');
  assert.equal(state.permissions[0].permissions_json, '["mcp:read"]', 'REPLACE permission par clé de scope');

  // --- Point 5 : cherry-pick et revert committent l'état RÉSULTANT ---
  // Setup : un second agent avec une décision propre.
  await db.run(
    'INSERT INTO agents (id, workspace_id, name, role, status, cognitive_budget, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    'agent-e2e-2', (await db.get('SELECT id FROM workspaces LIMIT 1'))?.id || null, 'AgentE2E2', 'worker', 'idle', 50, new Date().toISOString()
  );
  await db.run(
    'INSERT INTO genome_decisions (id, title, content, created_by, category, synaptic_weight) VALUES (?, ?, ?, ?, ?, ?)',
    'd-src', 'Decision source', 'contenu source', 'agent-e2e-1', 'strategy', 1
  );
  const srcCommit = await agentGit.createCommit(req, { agentId: 'agent-e2e-1', refName: 'main', metadata: { message: 'src' } });

  // Cherry-pick du commit source vers l'agent 2.
  const pick = await agentGit.cherryPick({ ...makeReq(), body: { objectId: srcCommit.id, targetAgentId: 'agent-e2e-2' } });
  assert.ok(pick.success, 'cherry-pick doit réussir');
  const pickRow = await db.get('SELECT state_json, tree_hash FROM agent_git_objects WHERE id = ?', pick.id);
  const pickState = JSON.parse(pickRow.state_json);
  const pickTree = require('../src/services/agentGitService/canonical').treeHash(pickState);
  assert.equal(pickRow.tree_hash, pickTree, 'tree du commit cherry-pick = hash de son propre state_json');
  // L'état committé doit refléter l'agent 2 (cible), pas l'agent 1 (source).
  assert.equal(pickState.agent.id, 'agent-e2e-2', 'le commit cherry-pick capture l état de la CIBLE');
  assert.ok(
    (pickState.decisions || []).some(d => d.id === 'agent-git-decision-agent-e2e-2-d-src'),
    'la décision cherry-pickée doit être présente dans l état committé (préfixée target)'
  );

  // Revert du commit cherry-pické : le commit de revert capture l état après
  // annulation — la décision doit avoir disparu de l état committé.
  const rev = await agentGit.revert({ ...makeReq(), body: { objectId: pick.id, targetAgentId: 'agent-e2e-2' } });
  assert.ok(rev.success, 'revert doit réussir');
  const revRow = await db.get('SELECT state_json FROM agent_git_objects WHERE id = ?', rev.id);
  const revState = JSON.parse(revRow.state_json);
  assert.equal(revState.agent.id, 'agent-e2e-2', 'le commit de revert capture l état de la cible');
  assert.ok(
    !(revState.decisions || []).some(d => String(d.id).endsWith('d-src')),
    'après revert, la décision cherry-pickée ne doit plus être dans l état committé'
  );

  console.log('[OK] point 1 - SQLite réel : schéma crypto complet, createCommit + parent + signature vérifiés');
  console.log('[OK] point 4 - patch REPLACE + identityOf (decisions/plasmids/permissions) sur SQLite réel');
  console.log('[OK] point 5 - cherry-pick/revert committent l état résultant réel (target + patch)');
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
