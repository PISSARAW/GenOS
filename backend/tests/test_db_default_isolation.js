'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

async function verifyDefaultDatabasePaths() {
  const prior = Object.fromEntries(['NODE_ENV', 'GENOS_TEST_MODE', 'GENOS_DB_PATH',
    'GENOS_TEST_RUN_ROOT', 'GENOS_DB_BACKUP_SKIP', 'GENOS_DB_BOOTSTRAP_SKIP']
    .map((key) => [key, process.env[key]]));
  const runRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'genos-test-db-scope-'));
  process.env.NODE_ENV = 'test';
  process.env.GENOS_TEST_MODE = '1';
  process.env.GENOS_DB_BACKUP_SKIP = '1';
  process.env.GENOS_DB_BOOTSTRAP_SKIP = '1';
  delete process.env.GENOS_DB_PATH;
  delete process.env.GENOS_TEST_RUN_ROOT;

  const database = require('../src/db');
  try {
    await database.getDatabase();
    assert.equal(database.databasePath(), ':memory:');
    await database.closeDatabase();

    process.env.GENOS_TEST_RUN_ROOT = runRoot;
    delete process.env.GENOS_DB_PATH;
    await database.getDatabase();
    assert.ok(database.databasePath().startsWith(runRoot));
    assert.ok(fs.existsSync(database.databasePath()));
  } finally {
    await database.closeDatabase();
    fs.rmSync(runRoot, { recursive: true, force: true });
    restoreEnvironment(prior);
  }
}

function restoreEnvironment(snapshot) {
  for (const [key, value] of Object.entries(snapshot)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

verifyDefaultDatabasePaths().then(() => {
  console.log('Implicit test database isolation and run scope: PASS');
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
