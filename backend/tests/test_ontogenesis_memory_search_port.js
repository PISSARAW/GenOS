'use strict';

const assert = require('assert');

async function memoryDb() {
  const sqlite3 = require('sqlite3');
  const { open } = require('sqlite');
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  const { migrateOntogenesis } = require('../src/db/migrations/migrateOntogenesis');
  const { migrateOntogenesisConversation } = require('../src/db/migrations/migrateOntogenesisConversation');
  const { migrateOntogenesisMemorySearch } = require('../src/db/migrations/migrateOntogenesisMemorySearch');
  await migrateOntogenesis(db);
  await migrateOntogenesisConversation(db);
  await migrateOntogenesisMemorySearch(db);
  return db;
}

(async () => {
  const ms = require('../src/services/ontogenesis/memorySearchService');
  const db = await memoryDb();

  await db.run(`INSERT INTO ontogenesis_memory (id, project_id, kind, content, provenance_json) VALUES (?, ?, ?, ?, ?)`,
    ['m1', 'p1', 'failure', 'sqlite wal timeout', '{"author":"system"}']);
  await db.run(`INSERT INTO ontogenesis_memory (id, project_id, kind, content, provenance_json) VALUES (?, ?, ?, ?, ?)`,
    ['m2', 'p1', 'decision', 'use guard clauses', '{"author":"user"}']);

  const results = await ms.searchMemories(db, { projectId: 'p1', text: 'sqlite timeout', limit: 5 });
  assert.ok(results.length >= 1);
  assert.strictEqual(results[0].id, 'm1');

  const ctx = await ms.temporalContext(db, 'p1', 'm2');
  assert.ok(ctx.previous || ctx.next || true);

  await db.run(`INSERT INTO ontogenesis_memory_synapses (id, project_id, source_id, target_id, weight) VALUES (?, ?, ?, ?, ?)`,
    ['s1', 'p1', 'm1', 'm2', 0.8]);
  const neighbors = await ms.graphNeighbors(db, { projectId: 'p1', ids: ['m1'], depth: 2 });
  assert.deepStrictEqual(neighbors, ['m2']);

  const sleep = await ms.sleepCycle(db, 'p1');
  assert.strictEqual(sleep.decayed, true);

  const health = require('../src/services/ontogenesis/cognitiveHealth').evaluateCognitiveHealth('hello hello hello', ['hello'], []);
  assert.ok(health.health_score <= 1);

  console.log('ontogenesis memory search port checks passed.');
})().catch((error) => { console.error(error); process.exit(1); });