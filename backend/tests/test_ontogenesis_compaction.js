'use strict';

const assert = require('assert');

async function memoryDb() {
  const sqlite3 = require('sqlite3');
  const { open } = require('sqlite');
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  const { migrateOntogenesis } = require('../src/db/migrations/migrateOntogenesis');
  const { migrateOntogenesisConversation } = require('../src/db/migrations/migrateOntogenesisConversation');
  const { migrateOntogenesisSummaries } = require('../src/db/migrations/migrateOntogenesisSummaries');
  await migrateOntogenesis(db);
  await migrateOntogenesisConversation(db);
  await migrateOntogenesisSummaries(db);
  return db;
}

(async () => {
  const compaction = require('../src/services/ontogenesis/compactionService');
  const memory = require('../src/services/ontogenesis/memoryService');

  // Résumé extractif pur : comptes, derniers éléments, plage.
  const summary = compaction.summarizeEntries([
    { id: 'a', kind: 'failure', content: 'test fragile sur le runner', created_at: '2026-10-01T08:00:00' },
    { id: 'b', kind: 'failure', content: 'conflit de branche', created_at: '2026-10-01T09:00:00' },
    { id: 'c', kind: 'decision', content: 'choisir a_team', created_at: '2026-10-01T10:00:00' }
  ]);
  assert.strictEqual(summary.count, 3);
  assert.ok(summary.content.includes('failure: 2 entree(s)'));
  assert.ok(summary.content.includes('[b] conflit de branche'));
  assert.ok(summary.content.includes('decision: 1 entree(s)'));
  assert.strictEqual(compaction.summarizeEntries([]), null);

  const db = await memoryDb();
  // Sous le seuil : rien ne bouge.
  await memory.recordMemory(db, { projectId: 'p1', kind: 'failure', content: 'f1', provenance: {} });
  const untouched = await compaction.compactMemory(db, { projectId: 'p1', keepLastN: 50 });
  assert.deepStrictEqual(untouched, { compacted: false, entries: 1 });

  // Au-delà : les anciennes sont résumées puis retirées, les récentes restent.
  await memory.recordMemory(db, { projectId: 'p1', kind: 'decision', content: 'd1', provenance: {} });
  await memory.recordMemory(db, { projectId: 'p1', kind: 'failure', content: 'f2', provenance: {} });
  await memory.recordMemory(db, { projectId: 'p1', kind: 'question', content: 'q1', provenance: {} });
  const done = await compaction.compactMemory(db, { projectId: 'p1', keepLastN: 2 });
  assert.strictEqual(done.compacted, true);
  assert.strictEqual(done.archived, 2);
  assert.strictEqual(done.remaining, 2);
  const remaining = await memory.listMemories(db, 'p1');
  assert.strictEqual(remaining.length, 2);
  const summaries = await db.all('SELECT * FROM ontogenesis_summaries WHERE project_id = ?', ['p1']);
  assert.strictEqual(summaries.length, 1);
  assert.strictEqual(summaries[0].entry_count, 2);
  assert.ok(summaries[0].content.includes('f1'));

  console.log('ontogenesis compaction checks passed.');
})().catch((error) => { console.error(error); process.exit(1); });
