'use strict';

const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');

process.env.NODE_ENV = 'test';
const file = path.join(process.env.GENOS_TEST_TMP || os.tmpdir(), `agentgit-interactive-${process.pid}-${Date.now()}.db`);
process.env.GENOS_DB_PATH = file;
const { getDatabase } = require('../src/db');
const git = require('../src/services/agentGitService');
const { planReplay, validateActions } = require('../src/services/agentGitService/rebaseInteractivePlan.cjs');

async function decision(db, id) {
  await db.run(`INSERT INTO genome_decisions (id, title, content, created_by, category, synaptic_weight)
    VALUES (?, ?, ?, ?, ?, ?)`, id, id, id, 'interactive-agent', 'strategy', 1);
}

async function main() {
  assert.throws(() => validateActions(['a'], [{ action: 'squash' }]), /First action/);
  const original = { agent: { id: 'a' }, decisions: [], permissions: [] };
  const altered = { ...original, permissions: [{ permissions_json: '["admin"]' }] };
  assert.throws(() => planReplay(original, [{ id: 'c', state_json: JSON.stringify(original), metadata_json: '{}' }],
    [{ action: 'edit', state: altered }], original), /cannot change permissions/);
  const baseState = { ...original, decisions: [{ id: 'belief', content: 'old', synaptic_weight: 1 }] };
  const changed = { ...baseState, decisions: [{ id: 'belief', content: 'new', synaptic_weight: 1 }] };
  const competing = { ...baseState, decisions: [{ id: 'belief', content: 'other', synaptic_weight: 1 }] };
  assert.throws(() => planReplay(competing, [{ id: 'c', state_json: JSON.stringify(changed), metadata_json: '{}' }],
    [{ action: 'pick' }], baseState), /Rebase conflict/);
  const dropped = planReplay(original, [{ id: 'c', state_json: JSON.stringify(changed), metadata_json: '{}' }],
    [{ action: 'drop' }], baseState);
  assert.equal(dropped.planned.length, 0);
  const db = await getDatabase(file);
  const workspace = await db.get('SELECT id FROM workspaces LIMIT 1');
  await db.run(`INSERT INTO agents (id, workspace_id, name, role, status, cognitive_budget)
    VALUES (?, ?, ?, ?, ?, ?)`, 'interactive-agent', workspace?.id || null, 'Interactive', 'worker', 'idle', 10);
  const req = { user: { username: 'rebase-test' }, tenant: null, body: {} };
  await decision(db, 'base');
  const base = await git.createCommit(req, { agentId: 'interactive-agent', refName: 'main' });
  await decision(db, 'feature-one');
  const first = await git.createCommit(req, { agentId: 'interactive-agent', refName: 'feature' });
  await decision(db, 'feature-two');
  const second = await git.createCommit(req, { agentId: 'interactive-agent', refName: 'feature' });
  await db.run("DELETE FROM genome_decisions WHERE id IN ('feature-one','feature-two')");
  await decision(db, 'onto-only');
  const onto = await git.createCommit(req, { agentId: 'interactive-agent', refName: 'main' });
  const result = await git.rebaseInteractive({ ...req, body: { objectIds: [first.id, second.id],
    ontoObjectId: onto.id, refName: 'feature', actions: [{ action: 'pick' }, { action: 'squash' }] } });
  assert.equal(result.success, true);
  assert.equal(result.newCommits.length, 1);
  const head = await db.get('SELECT object_id FROM agent_git_refs WHERE agent_id = ? AND ref_name = ?',
    'interactive-agent', 'feature');
  assert.equal(head.object_id, result.objectId);
  const stored = await db.get('SELECT parent_commit_id, state_json FROM agent_git_objects WHERE id = ?', result.objectId);
  assert.equal(stored.parent_commit_id, onto.id);
  const ids = JSON.parse(stored.state_json).decisions.map((item) => item.id).sort();
  assert.deepEqual(ids, ['base', 'feature-one', 'feature-two', 'onto-only']);
  assert.notEqual(result.objectId, base.id);
  const live = await git.collectState(db, req, 'interactive-agent');
  assert.equal(live.decisions.length, 4);
  console.log('AgentGit interactive rebase SQLite replay passed.');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
