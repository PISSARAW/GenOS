'use strict';

const assert = require('node:assert/strict');
const { fetchCorpus } = require('../src/services/vectorMemoryCorpus');

function tenantRows() {
  return [
    { rowid: 1, id: 'global-memory', title: 'Global', category: 'Experience', content: 'public knowledge', created_by: 'shared' },
    { rowid: 2, id: 'foreign-memory', title: 'Foreign', category: 'Experience', content: 'private tenant data', created_by: 'tenant-b' }
  ];
}

function assertExpectedScope(sql, params, expectedScope) {
  if (!expectedScope) return;
  assert.match(sql, /organization_id = \? AND project_id = \?/);
  if (expectedScope.includeGlobal) assert.match(sql, /OR \(organization_id IS NULL AND project_id IS NULL\)/);
  assert.deepEqual(params, [expectedScope.organizationId, expectedScope.projectId]);
}

function indexedQuery(sql, indexed) {
  if (sql.includes('_vec WHERE')) return indexed ? [{ rowid: 1, distance: 0.1 }, { rowid: 2, distance: 0.2 }] : [];
  if (sql.includes('_fts MATCH')) return [];
  return undefined;
}

function hydrationQuery(sql) {
  if (sql.includes('FROM trajectories t WHERE rowid')) {
    assert.match(sql, /workspace_id IS NULL/);
    return [];
  }
  if (!sql.includes('FROM genome_decisions t WHERE rowid')) return undefined;
  assert.match(sql, /t\.organization_id IS NULL AND t\.project_id IS NULL/);
  return [tenantRows()[0]];
}

function assertTrajectoryScope(sql, params, expectedScope) {
  if (!expectedScope) return assert.match(sql, /workspace_id IS NULL/);
  assert.match(sql, /workspace_id IN \(SELECT id FROM workspaces WHERE organization_id = \? AND project_id = \?\)/);
  assert.deepEqual(params, [expectedScope.organizationId, expectedScope.projectId]);
}

function fallbackQuery(sql, params, expectedScope) {
  if (sql.includes('FROM trajectories WHERE')) {
    assertTrajectoryScope(sql, params, expectedScope);
    return [];
  }
  if (!sql.includes('FROM genome_decisions WHERE')) return undefined;
  if (expectedScope) {
    assertExpectedScope(sql, params, expectedScope);
    return [];
  }
  assert.match(sql, /organization_id IS NULL AND project_id IS NULL/);
  return [tenantRows()[0]];
}

function scopedDatabase(indexed, expectedScope) {
  return {
    async all(sql, params = []) {
      const indexedResult = indexedQuery(sql, indexed);
      if (indexedResult !== undefined) return indexedResult;
      const hydrated = hydrationQuery(sql);
      if (hydrated !== undefined) return hydrated;
      const fallback = fallbackQuery(sql, params, expectedScope);
      if (fallback !== undefined) return fallback;
      throw new Error(`Unexpected corpus query: ${sql}`);
    }
  };
}

async function verifyUnscopedFallback() {
  const results = await fetchCorpus(scopedDatabase(false), '', null, {});
  assert.deepEqual(results.map((item) => item.id), ['global-memory']);
}

async function verifyUnscopedHydration() {
  const results = await fetchCorpus(scopedDatabase(true), '', Array(768).fill(0), {});
  assert.deepEqual(results.map((item) => item.id), ['global-memory']);
}

async function verifyTenantScope() {
  const scope = { organizationId: 'org-a', projectId: 'project-a' };
  await fetchCorpus(scopedDatabase(false, scope), '', null, scope);
  const sharedScope = { ...scope, includeGlobal: true };
  await fetchCorpus(scopedDatabase(false, sharedScope), '', null, sharedScope);
}

async function run() {
  await verifyUnscopedFallback();
  await verifyUnscopedHydration();
  await verifyTenantScope();
  await assert.rejects(fetchCorpus(scopedDatabase(false), '', null, { projectId: 'project-a' }), /Organization scope/);
  console.log('Vector memory tenant scope: unscoped, hydrated and fallback corpus isolation passed.');
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
