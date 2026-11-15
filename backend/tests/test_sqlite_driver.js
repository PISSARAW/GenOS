'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const sqliteVec = require('sqlite-vec');
const driver = require('../src/db/sqliteDriver');

function sourceFiles(folder) {
  return fs.readdirSync(folder, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(folder, entry.name);
    if (entry.isDirectory()) return sourceFiles(target);
    return /\.(?:js|cjs)$/.test(entry.name) ? [target] : [];
  });
}

function assertSingleProductionDriver() {
  const roots = [path.resolve(__dirname, '../src'), path.resolve(__dirname, '../bin')];
  const directImport = /require\(['"](?:sqlite|sqlite3|better-sqlite3)['"]\)/;
  const exceptions = new Set([path.resolve(__dirname, '../src/db/sqliteDriver.js')]);
  const offenders = roots.flatMap(sourceFiles).filter((file) => !exceptions.has(file)
    && directImport.test(fs.readFileSync(file, 'utf8')));
  assert.deepEqual(offenders, []);

  const manifest = require('../package.json');
  assert.equal(manifest.dependencies.sqlite, undefined);
  assert.equal(manifest.dependencies.sqlite3, undefined);
  assert.equal(manifest.dependencies['better-sqlite3'], '^13.0.3');
  assert.equal(manifest.devDependencies.sqlite, '^5.1.1');
  assert.equal(manifest.devDependencies.sqlite3, '^6.0.1');
}

async function assertAsyncCompatibility(folder) {
  const filename = path.join(folder, 'canonical.sqlite');
  const backup = path.join(folder, 'backup.sqlite');
  const db = await driver.open({ filename, driver: driver.Database });
  await db.exec('CREATE TABLE values_table (id INTEGER PRIMARY KEY AUTOINCREMENT, value TEXT NOT NULL)');
  const inserted = await db.run('INSERT INTO values_table(value) VALUES (?)', 'alpha');
  assert.equal(inserted.changes, 1);
  assert.equal(Number(inserted.lastID), 1);
  assert.deepEqual(await db.get('SELECT value FROM values_table WHERE id=?', inserted.lastID), { value: 'alpha' });
  assert.deepEqual(await db.all('SELECT id,value FROM values_table'), [{ id: 1, value: 'alpha' }]);
  sqliteVec.load(db.db);
  assert.match((await db.get('SELECT vec_version() AS version')).version, /^v?0\./);
  await db.db.backup(backup);
  await db.close();

  const readonly = await driver.open({ filename: backup, mode: driver.OPEN_READONLY });
  assert.equal((await readonly.get('SELECT COUNT(*) AS total FROM values_table')).total, 1);
  assert.throws(() => readonly.db.prepare('INSERT INTO values_table(value) VALUES (?)').run('blocked'));
  await readonly.close();
}

async function main() {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'genos-sqlite-driver-'));
  try {
    assertSingleProductionDriver();
    await assertAsyncCompatibility(folder);
    console.log('Canonical better-sqlite3 driver and async compatibility facade: PASS');
  } finally {
    fs.rmSync(folder, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
