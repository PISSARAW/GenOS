'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { open } = require('sqlite');
const sqlite3 = require('sqlite3');
const ledger = require('../src/services/cognitivePersistentVisibilityLedger');

async function main() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'omega-recovery-'));
  const filename = path.join(directory, 'visibility.db');
  let db;
  const key = { sessionId: 'mission', objectId: 'artifact', scope: 'project' };
  try {
    db = await open({ filename, driver: sqlite3.Database });
    await ledger.openSession(db, { sessionId: key.sessionId, model: 'model-a', contextRevision: '1' });
    await ledger.materialize(db, { ...key, value: { persisted: true } });
    await db.close();
    db = await open({ filename, driver: sqlite3.Database });
    assert.equal((await ledger.visible(db, key)).value.persisted, true);
    await ledger.openSession(db, { sessionId: key.sessionId, model: 'model-b' });
    assert.equal((await ledger.visible(db, key)).visible, false);
    await db.close();
    db = await open({ filename, driver: sqlite3.Database });
    assert.equal((await ledger.visible(db, key)).visible, false);
    assert.equal((await ledger.recover(db, key.sessionId)).fragments.length, 0);
    console.log('Omega durable recovery and invalidation passed.');
  } finally {
    if (db) await db.close();
    fs.unlinkSync(filename);
    fs.rmdirSync(directory);
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
