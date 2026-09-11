/**
 * N14 — pre-migration database backup (backend/src/db/index.js).
 * Verifies: no backup for missing/empty files, faithful copy + naming,
 * retention of the 3 most recent backups, best-effort never throws,
 * and one backup per boot via getDatabase.
 */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

process.env.NODE_ENV = 'test';

const { backupDatabaseFile } = require('../src/db');

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'genos-backup-test-'));
}

function listBackups(dir, base) {
  return fs.readdirSync(dir).filter((name) => name.startsWith(`${base}.backup-`)).sort();
}

function testMissingAndEmpty() {
  const dir = makeTempDir();
  assert.strictEqual(backupDatabaseFile(path.join(dir, 'nope.db')), null);
  const empty = path.join(dir, 'empty.db');
  fs.writeFileSync(empty, '');
  assert.strictEqual(backupDatabaseFile(empty), null);
  assert.deepStrictEqual(listBackups(dir, 'empty.db'), []);
  fs.rmSync(dir, { recursive: true, force: true });
  console.log('  PASS: missing/empty database files produce no backup.');
}

function testCopyAndRetention() {
  const dir = makeTempDir();
  const dbPath = path.join(dir, 't.db');
  fs.writeFileSync(dbPath, 'payload-123');
  const stamps = ['20200101-000001', '20200102-000002', '20200103-000003', '20200104-000004'];
  for (const stamp of stamps) {
    fs.writeFileSync(`${dbPath}.backup-${stamp}`, 'old');
  }
  const created = backupDatabaseFile(dbPath);
  assert.ok(created && created.includes('.backup-'), 'a backup path is returned');
  assert.ok(/^.*\.backup-\d{8}-\d{6}$/.test(created), 'backup name carries a YYYYMMDD-HHMMSS stamp');
  assert.strictEqual(fs.readFileSync(created, 'utf8'), 'payload-123');
  const remaining = listBackups(dir, 't.db');
  assert.strictEqual(remaining.length, 3, 'only the 3 most recent backups are kept');
  assert.ok(!remaining.includes('t.db.backup-20200101-000001'));
  assert.ok(!remaining.includes('t.db.backup-20200102-000002'));
  fs.rmSync(dir, { recursive: true, force: true });
  console.log('  PASS: faithful copy with stamp + retention of 3 backups.');
}

function testNeverThrows() {
  const dir = makeTempDir();
  assert.strictEqual(backupDatabaseFile(dir), null, 'a directory is not a database file');
  fs.rmSync(dir, { recursive: true, force: true });
  console.log('  PASS: backup failure is best-effort and never throws.');
}

async function testBootCreatesBackup() {
  const dir = makeTempDir();
  const dbPath = path.join(dir, 'boot.db');
  process.env.GENOS_DB_PATH = dbPath;
  const { getDatabase, closeDatabase } = require('../src/db');
  await getDatabase();
  await closeDatabase();
  await getDatabase();
  await closeDatabase();
  const backups = listBackups(dir, 'boot.db');
  assert.strictEqual(backups.length, 1, 'the second boot backs up the existing file once');
  fs.rmSync(dir, { recursive: true, force: true });
  console.log('  PASS: one pre-migration backup per boot via getDatabase.');
}

async function run() {
  console.log('=== N14 pre-migration backup ===');
  testMissingAndEmpty();
  testCopyAndRetention();
  testNeverThrows();
  await testBootCreatesBackup();
  console.log('N14 BACKUP TESTS PASSED.');
}

run().catch((err) => {
  console.error('N14 backup test failed:', err);
  process.exit(1);
});
