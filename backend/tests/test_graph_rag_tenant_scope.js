'use strict';

const assert = require('node:assert/strict');
const { openDatabase } = require('./helpers/biologyDatabase');
const graph = require('../src/services/graphRagService');
const ner = require('../src/services/nerService');

async function fixture(db) {
  await db.exec(`CREATE TABLE genome_decisions (id TEXT, title TEXT, category TEXT, content TEXT,
    synaptic_weight REAL, organization_id TEXT, project_id TEXT, created_by TEXT,
    created_at TEXT, embedding_blob BLOB);
    CREATE TABLE memory_synapses (source_id TEXT, target_id TEXT, weight REAL, transmitter_type TEXT,
      organization_id TEXT, project_id TEXT);
    INSERT INTO genome_decisions VALUES
      ('alpha-rust', 'Rust public', 'document', 'alpha content', 1, 'alpha', 'project-a', 'shared-agent', '2026-10-14T11:30:00Z', NULL),
      ('beta-sqlite', 'SQLite private', 'document', 'secret beta', 1, 'beta', 'project-b', 'shared-agent', '2026-10-14T11:20:00Z', NULL),
      ('global-sqlite', 'SQLite global', 'document', 'global content', 1, NULL, NULL, 'shared-agent', '2026-10-14T11:10:00Z', NULL),
      ('sibling-sqlite', 'SQLite sibling', 'document', 'sibling content', 1, 'alpha', 'project-b', 'shared-agent', '2026-10-14T11:25:00Z', NULL),
      ('global-anchor', 'Global anchor', 'Experience', 'anchor', 1, NULL, NULL, 'shared-agent', '2026-10-14T12:00:00Z', NULL);
    INSERT INTO memory_synapses VALUES ('alpha-rust', 'beta-sqlite', 1.5, 'glutamate', 'alpha', 'project-a');`);
}

async function qualify(db) {
  const original = ner.extractEntities;
  ner.extractEntities = async () => ({ entities: [{ text: 'SQLite' }, { text: 'Rust' }], relations: [] });
  try {
    const scoped = await graph.queryKnowledgeGraph('SQLite Rust', {
      dbInstance: db, organizationId: 'alpha', projectId: 'project-a'
    });
    assert.deepEqual(scoped.nodes.map((item) => item.id), ['alpha-rust']);
    assert.equal(JSON.stringify(scoped).includes('secret beta'), false);
    const withGlobal = await graph.queryKnowledgeGraph('SQLite Rust', {
      dbInstance: db, organizationId: 'alpha', projectId: 'project-a', includeGlobal: true
    });
    assert.deepEqual(withGlobal.nodes.map((item) => item.id).sort(), ['alpha-rust', 'global-sqlite']);
    const globalOnly = await graph.queryKnowledgeGraph('SQLite Rust', { dbInstance: db, allowGlobal: true });
    assert.deepEqual(globalOnly.nodes.map((item) => item.id), ['global-sqlite']);
    const anchor = { id: 'global-anchor', createdAt: '2026-10-14T12:00:00Z' };
    const unscopedNeighbors = await graph.fetchTemporalAnchors([anchor], db,
      { ownerId: 'shared-agent', horizonHours: 4 });
    assert.deepEqual(unscopedNeighbors.map((item) => item.id), ['global-sqlite']);
    const alphaNeighbors = await graph.fetchTemporalAnchors([anchor], db,
      { ownerId: 'shared-agent', organizationId: 'alpha', projectId: 'project-a', horizonHours: 4 });
    assert.deepEqual(alphaNeighbors.map((item) => item.id), ['alpha-rust']);
    const betaNeighbors = await graph.fetchTemporalAnchors([anchor], db,
      { ownerId: 'shared-agent', organizationId: 'beta', projectId: 'project-b', horizonHours: 4 });
    assert.deepEqual(betaNeighbors.map((item) => item.id), ['beta-sqlite']);
    const optedGlobalNeighbors = await graph.fetchTemporalAnchors([anchor], db,
      { ownerId: 'shared-agent', organizationId: 'empty', projectId: 'empty-project', includeGlobal: true, horizonHours: 4 });
    assert.deepEqual(optedGlobalNeighbors.map((item) => item.id), ['global-sqlite']);
    const expanded = await graph.expandGraphRag([
      { id: anchor.id, category: 'Experience', createdAt: anchor.createdAt, vector: [] }
    ], db, { ownerId: 'shared-agent' });
    assert.deepEqual(expanded.map((item) => item.id), ['global-sqlite']);
  } finally {
    ner.extractEntities = original;
  }
}

async function main() {
  const db = openDatabase();
  try { await fixture(db); await qualify(db); }
  finally { await db.close(); }
  console.log('GraphRAG tenant scope blocks cross-tenant and unapproved global memories.');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
