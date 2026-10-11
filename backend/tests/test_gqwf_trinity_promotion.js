'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const { withTransaction } = require('../src/db');
const { migrateGqwf } = require('../src/services/gqwf');
const agentGit = require('../src/services/agentGitService');
const trinity = require('../src/services/gqwf/trinityPromotion');
const { hashWorkspace } = require('../src/services/trinitySnapshotService');
const { previousPromotion } = require('../src/services/trinityPromotionIntegrity');

async function fixture() {
  const parent = path.resolve(__dirname, '../../.genos-agent-worlds/gqwf-trinity-tests');
  await fs.mkdir(parent, { recursive: true });
  const root = await fs.mkdtemp(path.join(parent, 'gqwf-trinity-'));
  const source = path.join(root, 'source');
  const target = path.join(root, 'candidate');
  await fs.mkdir(source);
  await fs.mkdir(target);
  await fs.writeFile(path.join(source, 'a.txt'), 'before');
  await fs.writeFile(path.join(target, 'a.txt'), 'after');
  const db = await open({ filename: path.join(root, 'test.sqlite'), driver: sqlite3.Database });
  await db.exec(`PRAGMA foreign_keys = ON;
    CREATE TABLE workspaces (id TEXT PRIMARY KEY, path TEXT NOT NULL, organization_id TEXT, project_id TEXT);
    CREATE TABLE trinity_worlds (agent_id TEXT PRIMARY KEY, workspace_root TEXT NOT NULL);
    CREATE TABLE agent_git_objects (id TEXT PRIMARY KEY, agent_id TEXT NOT NULL, commit_hash TEXT,
      metadata_json TEXT NOT NULL, signature TEXT NOT NULL, signature_algorithm TEXT NOT NULL);`);
  await db.run('INSERT INTO workspaces (id, path) VALUES (?, ?)', 'ws-a', source);
  await db.run('INSERT INTO trinity_worlds (agent_id, workspace_root) VALUES (?, ?)', 'worker-1', source);
  await migrateGqwf(db);
  return { parent, root, source, target, db };
}

async function storeReceipt(db, metadata) {
  await db.run(`INSERT OR REPLACE INTO agent_git_objects
    (id, agent_id, commit_hash, metadata_json, signature, signature_algorithm) VALUES (?, ?, ?, ?, ?, ?)`,
  'commit-1', 'worker-1', 'signed-hash', JSON.stringify(metadata),
  agentGit.signObject('signed-hash', metadata), 'hmac-sha256');
}

async function exercise(context) {
  const artifact = { sourceWorkspaceId: 'ws-a', sourceAgentId: 'worker-1', sourceWorkspace: context.source,
    targetWorkspace: context.target };
  await assert.rejects(trinity.prepare(context.db,
    { ...artifact, sourceWorkspace: context.target }), /identity changed/);
  const prepared = await trinity.prepare(context.db, artifact);
  assert.notEqual(prepared.baseHash, prepared.candidateHash);
  const input = { prepared, artifact, experimentId: 'experiment-1', candidateWorkspaceId: 'candidate-1',
    contentHash: await hashWorkspace(context.target), integrationChecks: [{ commandId: 'npm-test', passed: true }],
    claimsCoveredByChecks: true, objectId: 'commit-1', agentId: 'worker-1' };
  await assert.rejects(trinity.publish(context.db, input), /evidence is invalid/);
  const metadata = { experimentId: input.experimentId, candidateWorkspaceId: input.candidateWorkspaceId,
    contentHash: input.contentHash, gqwfRootHash: prepared.candidateHash, gqwfWorkspaceId: 'ws-a' };
  await storeReceipt(context.db, { ...metadata, gqwfRootHash: prepared.baseHash });
  await assert.rejects(trinity.publish(context.db, input), /does not bind/);
  await storeReceipt(context.db, metadata);
  await assert.rejects(trinity.publish(context.db,
    { ...input, integrationChecks: [{ passed: false }] }), /evidence is incomplete/);
  await fs.writeFile(path.join(context.target, 'a.txt'), 'changed');
  await assert.rejects(trinity.publish(context.db, input), /no longer matches verified content/);
  await fs.writeFile(path.join(context.target, 'a.txt'), 'after');
  const published = await withTransaction(context.db, () => trinity.publish(context.db, input));
  assert.equal(published.rootHash, prepared.candidateHash);
  assert.equal(published.generation, 1);
  const event = await context.db.get('SELECT * FROM gqwf_head_events WHERE workspace_id = ? AND name = ?',
    'ws-a', 'trinity/experiment-1');
  assert.equal(event.evidence_id, 'commit-1');
  assert.equal(event.previous_hash, prepared.baseHash);
  const signed = await context.db.get('SELECT * FROM agent_git_objects WHERE id = ?', 'commit-1');
  const decision = { artifact, verification: { contentHash: input.contentHash },
    agentGit: { objectId: 'commit-1' }, gqwf: published };
  const replayDb = { get: async (sql, ...params) => {
    if (sql.includes('FROM trinity_experiments')) return { status: 'promoted', decision_json: JSON.stringify(decision) };
    if (sql.includes('FROM agent_git_objects o')) return signed;
    return context.db.get(sql, ...params);
  } };
  assert.equal((await previousPromotion({ db: replayDb, missionId: 'mission-1' })).promoted, true);
  await context.db.run("UPDATE gqwf_head_events SET evidence_id = 'forged' WHERE workspace_id = ? AND name = ?",
    'ws-a', 'trinity/experiment-1');
  const rejected = await previousPromotion({ db: replayDb, missionId: 'mission-1' });
  assert.equal(rejected.promoted, false);
  assert.equal(rejected.reason, 'TRINITY_PROMOTION_GQWF_INVALID');
}

async function main() {
  const context = await fixture();
  try { await exercise(context); }
  finally {
    await context.db.close();
    if (path.dirname(context.root) !== context.parent || !path.basename(context.root).startsWith('gqwf-trinity-')) {
      throw new Error('Refusing to remove an unmanaged GQWF Trinity fixture.');
    }
    await fs.rm(context.root, { recursive: true, force: true });
  }
  console.log('GQWF Trinity signed promotion checks passed.');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
