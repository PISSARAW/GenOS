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
      ('alpha-rust', 'Rust public', 'document', 'alpha content', 1, 'alpha', 'project-a', 'owner', '', NULL),
      ('beta-sqlite', 'SQLite private', 'document', 'secret beta', 1, 'beta', 'project-b', 'owner', '', NULL),
      ('global-sqlite', 'SQLite global', 'document', 'global content', 1, NULL, NULL, 'owner', '', NULL),
      ('sibling-sqlite', 'SQLite sibling', 'document', 'sibling content', 1, 'alpha', 'project-b', 'owner', '', NULL);
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
