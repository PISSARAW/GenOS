'use strict';

/**
 * @file testDatabase.js
 * @description Database WAL mode and transaction tests
 */

async function runDatabaseTests(options = {}) {
  const { db, assert } = options;
  console.log('--- 1. Database WAL Mode & Transaction Verification ---');
  const walRow = await db.get('PRAGMA journal_mode;');
  assert(walRow && walRow.journal_mode.toLowerCase() === 'wal', 'SQLite PRAGMA journal_mode is WAL');

  const { withTransaction } = require('../src/db');
  await withTransaction(db, async (txDb) => {
    await txDb.run('INSERT INTO workspaces (id, name, path) VALUES (?, ?, ?)', 'ws-tx-test', 'TxTest', '/tmp/tx');
  });
  const txRow = await db.get('SELECT * FROM workspaces WHERE id = ?', 'ws-tx-test');
  assert(txRow !== undefined, 'withTransaction helper committed transaction successfully');
}

module.exports = { runDatabaseTests };