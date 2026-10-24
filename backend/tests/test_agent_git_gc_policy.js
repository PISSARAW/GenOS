'use strict';

const assert = require('node:assert/strict');
const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const { pruneUnreachable } = require('../src/services/agentGitService/gcPolicy.cjs');

async function main() {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  try {
    await db.exec(`CREATE TABLE agent_git_objects (id TEXT PRIMARY KEY, agent_id TEXT, object_kind TEXT,
      created_at TEXT, state_json TEXT);
      CREATE TABLE agent_git_commit_parents (commit_id TEXT, parent_commit_id TEXT, position INTEGER);
      CREATE TABLE agent_git_commits (commit_id TEXT PRIMARY KEY);
      CREATE TABLE agent_git_refs (agent_id TEXT, object_id TEXT);
      CREATE TABLE agent_git_archives (agent_id TEXT, object_id TEXT);
      CREATE TABLE agent_git_notes (agent_id TEXT, object_id TEXT);
      CREATE TABLE agent_git_reflog (agent_id TEXT, old_object_id TEXT, new_object_id TEXT, created_at TEXT);`);
    for (const id of ['A', 'B', 'C', 'D', 'E', 'F', 'H']) {
      await db.run("INSERT INTO agent_git_objects VALUES (?, 'agent', 'commit', datetime('now', '-80 days'), '{}')", id);
      await db.run('INSERT INTO agent_git_commits VALUES (?)', id);
    }
    await db.run("INSERT INTO agent_git_objects VALUES ('G', 'agent', 'commit', datetime('now'), '{}')");
    for (const [child, parent] of [['B', 'A'], ['D', 'C'], ['G', 'H']]) {
      await db.run('INSERT INTO agent_git_commit_parents VALUES (?, ?, 0)', child, parent);
    }
    await db.run("INSERT INTO agent_git_refs VALUES ('agent', 'B')");
    await db.run("INSERT INTO agent_git_archives VALUES ('agent', 'D')");
    await db.run("INSERT INTO agent_git_notes VALUES ('agent', 'E')");
    const retained = await pruneUnreachable(db, 'agent', { keep: 3, retentionDays: 30 });
    assert.equal(retained.pruned, 0);
    const pruned = await pruneUnreachable(db, 'agent', { keep: 0, retentionDays: 30 });
    assert.equal(pruned.pruned, 1);
    const ids = (await db.all('SELECT id FROM agent_git_objects ORDER BY id')).map((row) => row.id);
    assert.deepEqual(ids, ['A', 'B', 'C', 'D', 'E', 'G', 'H']);
    assert.deepEqual(await db.all('SELECT commit_id FROM agent_git_commits WHERE commit_id = ?', 'F'), []);
  } finally { await db.close(); }
  console.log('AgentGit reachability GC passed.');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
