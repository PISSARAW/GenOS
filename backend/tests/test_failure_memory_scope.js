'use strict';

const assert = require('node:assert/strict');
const { openDatabase } = require('./helpers/biologyDatabase');
const search = require('../src/services/primitiveHandlers/memoryFailureSearch');

async function fixture(db) {
  await db.exec(`CREATE TABLE genome_decisions (id TEXT, title TEXT, content TEXT,
    category TEXT, created_at TEXT, embedding_blob BLOB, organization_id TEXT, project_id TEXT);
    CREATE TABLE workspaces (id TEXT, organization_id TEXT, project_id TEXT);
    CREATE TABLE trajectories (id TEXT, title TEXT, semantic_summary TEXT, status TEXT,
      created_at TEXT, embedding_blob BLOB, workspace_id TEXT);`);
  const cases = [['own', 'org', 'project'], ['sibling', 'org', 'other'], ['foreign', 'foreign', 'project'],
    ['global', null, null], ['ambiguous', null, 'other'], ['organization-only', 'org', null]];
  for (const [id, organization, project] of cases) {
    await db.run("INSERT INTO genome_decisions VALUES (?, ?, ?, 'Failure', '2026-10-10', NULL, ?, ?)",
      [id, id, `private-${id}`, organization, project]);
    await db.run('INSERT INTO workspaces VALUES (?, ?, ?)', [id, organization, project]);
    await db.run("INSERT INTO trajectories VALUES (?, ?, ?, 'rejected', '2026-10-10', NULL, ?)",
      [`trajectory-${id}`, id, `private-${id}`, id]);
  }
  await db.run("INSERT INTO trajectories VALUES ('orphan', 'orphan', 'private-orphan', 'rejected', '2026-10-10', NULL, 'missing')");
}

function ids(rows) { return rows.map(row => row.id).sort(); }

async function qualify(db) {
  const context = { organizationId: 'org', projectId: 'project' };
  assert.deepEqual(ids(await search.fetchFailureCandidates(db, context)), ['own', 'trajectory-own']);
  assert.deepEqual(ids(await search.fetchDecisionFailures(db, context, 50)), ['own']);
  assert.deepEqual(ids(await search.fetchFailureCandidates(db, { ...context, includeGlobal: true })),
    ['global', 'own', 'trajectory-global', 'trajectory-own']);
  assert.deepEqual(ids(await search.fetchFailureCandidates(db, { organizationId: 'org' })),
    ['organization-only', 'own', 'sibling', 'trajectory-organization-only', 'trajectory-own', 'trajectory-sibling']);
  assert.deepEqual(await search.fetchFailureCandidates(db, { ...context, projectId: 'missing' }), []);
  assert.deepEqual(ids(await search.fetchFailureCandidates(db, {})), ['global', 'trajectory-global']);
  for (const bad of [null, [], 7, 'org', true, { projectId: 'project' }, { organizationId: [] }, { organizationId: ' ' },
    { ...context, includeGlobal: 'true' }]) {
    await assert.rejects(search.fetchFailureCandidates(db, bad), error => error.code?.startsWith('FAILURE_MEMORY_SCOPE_'));
  }
  const injection = { ...context, projectId: "project' OR 1=1 --" };
  assert.deepEqual(await search.fetchFailureCandidates(db, injection), []);
}

async function main() {
  const db = openDatabase();
  try { await fixture(db); await qualify(db); }
  finally { await db.close(); }
  console.log('Failure memory: projects, tenants, explicit global opt-in, trajectories and malformed scopes qualified.');
}

main().catch(error => { console.error(error); process.exitCode = 1; });
