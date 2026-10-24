'use strict';

const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');

process.env.NODE_ENV = 'test';
process.env.GENOS_AGENT_GIT_SIGNING_SECRET = 'agentgit-remote-sync-test-secret';
const directory = process.env.GENOS_TEST_TMP || os.tmpdir();
const sourcePath = path.join(directory, `agentgit-sync-source-${process.pid}-${Date.now()}.db`);
const targetPath = path.join(directory, `agentgit-sync-target-${process.pid}-${Date.now()}.db`);
const dbModule = require('../src/db');
const git = require('../src/services/agentGitService');
const sync = require('../src/services/agentGitService/remoteSync.cjs');
const { updateRef } = require('../src/services/agentGitService/refs');

async function seed(db) {
  await db.run(`INSERT OR IGNORE INTO workspaces (id, name, path, visibility, language)
    VALUES (?, ?, ?, ?, ?)`, 'sync-workspace', 'Sync', directory, 'Private', 'en');
  await db.run(`INSERT INTO agents (id, workspace_id, name, role, status, cognitive_budget)
    VALUES (?, ?, ?, ?, ?, ?)`, 'sync-agent', 'sync-workspace', 'Sync', 'worker', 'idle', 10);
}

async function main() {
  const req = { user: { username: 'sync-test' }, tenant: null, body: { remoteName: 'peer' } };
  const source = await dbModule.getDatabase(sourcePath);
  await seed(source);
  const base = await git.createCommit(req, { agentId: 'sync-agent', refName: 'main' });
  await source.run('UPDATE agents SET role = ? WHERE id = ?', 'reviewer', 'sync-agent');
  const head = await git.createCommit(req, { agentId: 'sync-agent', refName: 'main' });
  const history = await sync.exportHistory({ db: source, req, agentId: 'sync-agent', refName: 'main' });
  assert.deepEqual(history.history.map((entry) => entry.object.id), [base.id, head.id]);
  await source.run('UPDATE agents SET role = ? WHERE id = ?', 'candidate', 'sync-agent');
  const alternative = await git.createCommit(req, { agentId: 'sync-agent', refName: 'alternative', parentCommitId: base.id });
  const alternateHistory = { ...(await sync.exportHistory({ db: source, req, agentId: 'sync-agent', refName: 'alternative' })),
    refName: 'main' };
  const target = await dbModule.getDatabase(targetPath);
  await seed(target);
  const receipt = await sync.importHistory(target, req, history);
  assert.equal(receipt.imported, 2);
  assert.equal(receipt.fastForward, true);
  const imported = await target.get('SELECT signature, parent_commit_id FROM agent_git_objects WHERE id = ?', head.id);
  assert.equal(imported.parent_commit_id, base.id);
  assert.equal(imported.signature, history.history[1].object.signature);
  await updateRef({ db: target, req, agentId: 'sync-agent', refName: 'main', objectId: base.id,
    options: { action: 'test-base' } });
  assert.deepEqual(await sync.divergence(target, base.id, head.id), { ahead: 0, behind: 1, known: true });
  const pulled = await git.pull({ ...req, body: { targetAgentId: 'sync-agent', remoteName: 'peer', refName: 'main' } });
  assert.equal(pulled.success, true);
  assert.equal((await target.get('SELECT role FROM agents WHERE id = ?', 'sync-agent')).role, 'reviewer');
  await assert.rejects(() => sync.importHistory(target, req, alternateHistory), /diverged/);
  assert.ok(!await target.get('SELECT id FROM agent_git_objects WHERE id = ?', alternative.id));
  const forced = await sync.importHistory(target, { ...req, body: { remoteName: 'peer', force: true,
    expectedRemoteObjectId: head.id } }, alternateHistory);
  assert.equal(forced.forcedWithLease, true);
  const tracked = await target.get('SELECT object_id FROM agent_git_refs WHERE agent_id = ? AND ref_name = ?',
    'sync-agent', sync.trackingName('peer', 'main'));
  assert.equal(tracked.object_id, alternative.id);
  console.log('AgentGit remote history, pull and lease checks passed.');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
