'use strict';

const assert = require('assert');

async function memoryDb() {
  const sqlite3 = require('sqlite3');
  const { open } = require('sqlite');
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  const { migrateOntogenesis } = require('../src/db/migrations/migrateOntogenesis');
  const { migrateOntogenesisLedger } = require('../src/db/migrations/migrateOntogenesisLedger');
  await migrateOntogenesis(db);
  await migrateOntogenesisLedger(db);
  return db;
}

(async () => {
  const ledger = require('../src/services/ontogenesis/ledgerService');

  const db = await memoryDb();

  // Séquences croissantes, rejouable depuis n'importe quel point.
  const first = await ledger.appendEntry(db, { projectId: 'p1', kind: 'tick', payload: { state: 'PLANNING' } });
  const second = await ledger.appendEntry(db, { projectId: 'p1', kind: 'dispatch', payload: {} });
  assert.strictEqual(first.seq + 1, second.seq);
  const all = await ledger.listSince(db, { projectId: 'p1', sinceSeq: 0 });
  assert.deepStrictEqual(all.map((row) => row.kind), ['tick', 'dispatch']);
  const tail = await ledger.listSince(db, { projectId: 'p1', sinceSeq: first.seq });
  assert.deepStrictEqual(tail.map((row) => row.kind), ['dispatch']);
  const other = await ledger.listSince(db, { projectId: 'p2', sinceSeq: 0 });
  assert.strictEqual(other.length, 0);

  // Dépenses cumulées et comparaison aux budgets.
  assert.deepStrictEqual(await ledger.getSpend(db, 'p1'), { tokens: 0, usd: 0, seconds: 0 });
  await ledger.recordSpend(db, { projectId: 'p1', tokens: 1000, usd: 0.1, seconds: 12 });
  const spend = await ledger.recordSpend(db, { projectId: 'p1', tokens: 500, usd: 0, seconds: 3 });
  assert.deepStrictEqual(spend, { tokens: 1500, usd: 0.1, seconds: 15 });
  const budgets = { tokens: 140000, usd: 1, seconds: 120 };
  assert.deepStrictEqual(ledger.spendVsBudget(budgets, spend), { within: true, overruns: [] });
  const blown = ledger.spendVsBudget({ tokens: 1000, usd: 0.05, seconds: 120 }, spend);
  assert.deepStrictEqual(blown, { within: false, overruns: ['tokens', 'usd'] });

  console.log('ontogenesis ledger checks passed.');
})().catch((error) => { console.error(error); process.exit(1); });
