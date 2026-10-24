'use strict';

const assert = require('node:assert/strict');
const { storeObject } = require('../src/services/agentGitService/storeObjectHelper.cjs');
const { wrap } = require('../src/services/agentGitService/agentGitDb.cjs');
const { verifySource } = require('../src/services/agentGitService/verifiedMerge.cjs');

async function main() {
  const previous = process.env.GENOS_AGENT_GIT_DELTA_STORAGE;
  process.env.GENOS_AGENT_GIT_DELTA_STORAGE = 'true';
  const rows = new Map();
  const db = {
    get: async (_sql, id) => rows.get(id) || null,
    run: async (sql, ...args) => {
      if (sql.includes('INSERT INTO agent_git_objects')) rows.set(args[0], {
        id: args[0], state_json: args[7], metadata_json: args[8], state_hash: args[6]
      });
    }
  };
  try {
    const state = { schema: 'genos.agent-git-state/v1', agent: { id: 'a', name: 'first' },
      decisions: Array.from({ length: 80 }, (_, id) => ({ id: String(id), content: 'unchanged evidence '.repeat(8) })),
      capturedAt: 'one' };
    const root = await storeObject(db, { agentId: 'a', workspaceId: 'w', kind: 'commit', state });
    const next = { ...state, agent: { id: 'a', name: 'second' }, capturedAt: 'two' };
    const child = await storeObject(db, { agentId: 'a', workspaceId: 'w', kind: 'commit', state: next,
      parentCommitId: root.id });
    assert.ok(JSON.parse(rows.get(child.id).state_json).$genosAgentGitStorage);
    assert.ok(rows.get(child.id).state_json.length < JSON.stringify(next).length * 0.8);
    const restored = await wrap(db).get('SELECT state_json FROM agent_git_objects WHERE id = ?', child.id);
    assert.deepEqual(JSON.parse(restored.state_json), next);
    const stored = rows.get(child.id);
    const tampered = JSON.parse(stored.state_json);
    tampered.set.agent.name = 'tampered';
    stored.state_json = JSON.stringify(tampered);
    await assert.rejects(wrap(db).get('SELECT state_json FROM agent_git_objects WHERE id = ?', child.id), /hash mismatch/);
    await sqliteCase(state, next);
  } finally {
    if (previous === undefined) delete process.env.GENOS_AGENT_GIT_DELTA_STORAGE;
    else process.env.GENOS_AGENT_GIT_DELTA_STORAGE = previous;
  }
  console.log('AgentGit delta storage passed.');
}

async function sqliteCase(state, next) {
  const sqlite3 = require('sqlite3').verbose();
  const { open } = require('sqlite');
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  try {
    await db.exec(`CREATE TABLE agent_git_objects (
      id TEXT PRIMARY KEY, agent_id TEXT, workspace_id TEXT, object_kind TEXT, ref_name TEXT,
      remote_name TEXT, state_hash TEXT, state_json TEXT, metadata_json TEXT, signature TEXT,
      created_by TEXT, parent_commit_id TEXT, tree_hash TEXT, commit_hash TEXT,
      signature_algorithm TEXT, author_key_id TEXT, public_key_fingerprint TEXT,
      signed_commit_envelope TEXT);
      CREATE TABLE agent_git_commit_parents (commit_id TEXT, parent_commit_id TEXT, position INTEGER);`);
    const root = await storeObject(db, { agentId: 'a', workspaceId: 'w', kind: 'commit', state });
    const child = await storeObject(db, { agentId: 'a', workspaceId: 'w', kind: 'commit', state: next,
      parentCommitId: root.id });
    const raw = await db.get('SELECT state_json FROM agent_git_objects WHERE id = ?', child.id);
    assert.ok(raw.state_json.includes('genos.agent-git-delta/v1'));
    const materialized = await wrap(db).get('SELECT * FROM agent_git_objects WHERE id = ?', child.id);
    assert.deepEqual(JSON.parse(materialized.state_json), next);
    assert.deepEqual(verifySource(materialized), []);
  } finally { await db.close(); }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
