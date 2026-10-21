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
  for (const id of ['p', 'f']) {
    await db.run(`INSERT INTO agents(id, name, role, execution_mode, status, workspace_id, model_tier, parent_agent_id)
      VALUES (?, ?, 'worker', 'worker', 'idle', ?, 'same-model', ?)`, id, id, WORKSPACE.id,
      id === 'f' ? 'p' : null);
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
    const sp = await sessionFor(db, 'p', 'social-p');
    const sf = await sessionFor(db, 'f', 'social-f');

    // 1. Le parent p enregistre une decision avec issue
    await decisions.begin(db, { session: sp, operationId: 'task-p-1', domain: 'worker',
      dimensions: ['characteristics'] });
    await decisions.finish(db, { session: sp, operationId: 'task-p-1', success: true,
      attribution: 'self', evidenceRef: { executionRunId: 'run-1', outcome: 'ok' } });
    const modelP = await decisions.selfModel(db, { agentId: 'p' });
    assert.equal(modelP.capabilities.length, 1);
    assert.equal(modelP.capabilities[0].observations, 1);

    // 2. Le fork n'herite pas de l'experience du parent : aucun transfert implicite
    const modelF = await decisions.selfModel(db, { agentId: 'f' });
    assert.equal(modelF.capabilities.length, 0);

    // 3. Les incarnations sont distinctes
    const headP = await store.head(db, 'p');
    const headF = await store.head(db, 'f');
    assert.notEqual(headP.incarnation_id, headF.incarnation_id);
    assert.equal(headP.owner_id, 'social-p');
    assert.equal(headF.owner_id, 'social-f');

    // 4. p reconnait f comme paire : presentation valide mais identite differente
    const presentationF = await peers.present(db, { session: sf, audienceId: 'p' });
    assert.equal(presentationF.body.agentId, 'f');
    assert.notEqual(presentationF.body.incarnationId, headP.incarnation_id);
    const receipt = await peers.recognize(db, {
      observerId: 'p', presentation: presentationF, operationId: 'meet-f',
    });
    assert.equal(receipt.peerId, 'f');
    assert.equal(receipt.verified, true);
    assert.notEqual(receipt.peerHead, headP.head_hash);

    // 5. Une decision prise par f est attribuee a f, pas a p
    await decisions.begin(db, { session: sf, operationId: 'task-f-1', domain: 'worker',
      dimensions: ['characteristics'] });
    await decisions.finish(db, { session: sf, operationId: 'task-f-1', success: false,
      attribution: 'self', evidenceRef: { executionRunId: 'run-2', outcome: 'ko' } });
    const modelPAfter = await decisions.selfModel(db, { agentId: 'p' });
    assert.equal(modelPAfter.capabilities[0].observations, 1, 'p garde une seule observation');
    const modelFAfter = await decisions.selfModel(db, { agentId: 'f' });
    assert.equal(modelFAfter.capabilities.length, 1);
    assert.equal(modelFAfter.capabilities[0].observations, 1);

    // 6. Le dossier de p distingue le fork de lui-meme (ligne parent-agent_id)
    const rowF = await db.get('SELECT * FROM agents WHERE id = ?', 'f');
    assert.equal(rowF.parent_agent_id, 'p');

    await incarnations.release(db, sp);
    await incarnations.release(db, sf);
    console.log('Parent vs fork: PASS');
  } finally {
    await db.close();
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
