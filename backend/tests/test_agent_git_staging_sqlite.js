'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

process.env.NODE_ENV = 'test';
const file = path.join(process.env.GENOS_TEST_TMP || os.tmpdir(), `agentgit-stage-${process.pid}-${Date.now()}.db`);
process.env.GENOS_DB_PATH = file;
const { getDatabase } = require('../src/db');
const git = require('../src/services/agentGitService');

async function main() {
  const db = await getDatabase(file);
  const workspace = await db.get('SELECT id FROM workspaces LIMIT 1');
  await db.run(`INSERT INTO agents (id, workspace_id, name, role, status, cognitive_budget)
    VALUES (?, ?, ?, ?, ?, ?)`, 'stage-agent', workspace?.id || null, 'Stage', 'worker', 'idle', 10);
  const req = { user: { username: 'staging-test' }, tenant: null, body: { agentId: 'stage-agent' } };
  const base = await git.createCommit(req, { agentId: 'stage-agent', refName: 'main' });
  await db.run(`INSERT INTO genome_decisions (id, title, content, created_by, category, synaptic_weight)
    VALUES (?, ?, ?, ?, ?, ?)`, 'staged-decision', 'Stage', 'new', 'stage-agent', 'strategy', 1);
  const staged = await git.stage({ ...req, body: { ...req.body, section: 'decisions' } });
  assert.equal(staged.success, true);
  assert.equal(staged.stagedCount, 1);
  await db.run('UPDATE agents SET role = ? WHERE id = ?', 'reviewer', 'stage-agent');
  const beforeCommit = await git.status(req);
  assert.deepEqual(beforeCommit.staged.map((item) => item.section), ['decisions']);
  assert.ok(beforeCommit.unstagedSections.includes('agent'));
  assert.ok(!beforeCommit.unstagedSections.includes('decisions'));
  const committed = await git.commitFromIndex(req, { agentId: 'stage-agent', refName: 'main' });
  assert.equal(committed.success, true);
  const shown = await git.show({ ...req, body: { objectId: committed.objectId } });
  assert.equal(shown.object.state.agent.role, 'worker');
  assert.equal(shown.object.state.decisions[0].id, 'staged-decision');
  const forged = await git.stage({ ...req, body: { ...req.body, section: 'agent', items: { role: 'admin' } } });
  assert.equal(forged.success, false);
  await git.stage({ ...req, body: { ...req.body, section: 'agent' } });
  await git.createCommit(req, { agentId: 'stage-agent', refName: 'main' });
  assert.equal((await git.status(req)).indexBaseMoved, true);
  const stale = await git.commitFromIndex(req, { agentId: 'stage-agent', refName: 'main' });
  assert.equal(stale.success, false);
  assert.match(stale.error, /Ref moved/);
  assert.notEqual(base.id, committed.objectId);
  console.log('AgentGit SQLite staging isolation passed.');
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => {
  try { fs.rmSync(file, { force: true }); } catch (_) {}
});
