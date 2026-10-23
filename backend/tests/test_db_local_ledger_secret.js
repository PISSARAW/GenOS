'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { localLedgerSecretPath, loadDatabaseSigningSecret, localToolMembraneSecretPath,
  loadToolMembraneSigningSecret } = require('../src/db');

async function run() {
  const original = Object.fromEntries([
    'GENOS_GVX_LEDGER_HMAC_SECRET', 'GENOS_TOOL_MEMBRANE_HMAC_SECRET', 'GENOS_DB_PATH',
    'GENOS_DB_BOOTSTRAP_SKIP', 'GENOS_DB_BACKUP_SKIP'
  ].map((name) => [name, process.env[name]]));
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'genos-local-ledger-secret-'));
  const databasePath = path.join(directory, 'ontogenesis.db');
  try {
    assert.equal(localLedgerSecretPath(':memory:'), null);
    assert.equal(loadDatabaseSigningSecret(databasePath), false);
    assert.equal(localToolMembraneSecretPath(':memory:'), null);
    assert.equal(loadToolMembraneSigningSecret(databasePath), false);

    const secret = 'a'.repeat(64);
    const membraneSecret = 'b'.repeat(64);
    fs.writeFileSync(localLedgerSecretPath(databasePath), secret, { mode: 0o600 });
    fs.writeFileSync(localToolMembraneSecretPath(databasePath), membraneSecret, { mode: 0o600 });
    process.env.GENOS_GVX_LEDGER_HMAC_SECRET = 'process-wide-secret-that-is-not-local';
    process.env.GENOS_TOOL_MEMBRANE_HMAC_SECRET = 'process-wide-membrane-secret-not-local';
    assert.equal(loadDatabaseSigningSecret(databasePath), true);
    assert.equal(process.env.GENOS_GVX_LEDGER_HMAC_SECRET, secret);
    assert.equal(loadToolMembraneSigningSecret(databasePath), true);
    assert.equal(process.env.GENOS_TOOL_MEMBRANE_HMAC_SECRET, membraneSecret);

    process.env.GENOS_GVX_LEDGER_HMAC_SECRET = '';
    process.env.GENOS_DB_PATH = databasePath;
    process.env.GENOS_DB_BOOTSTRAP_SKIP = '1';
    process.env.GENOS_DB_BACKUP_SKIP = '1';
    const db = require('../src/db');
    await db.getDatabase();
    assert.equal(process.env.GENOS_GVX_LEDGER_HMAC_SECRET, secret);
    assert.equal(process.env.GENOS_TOOL_MEMBRANE_HMAC_SECRET, membraneSecret);
    await db.closeDatabase();

    fs.writeFileSync(localLedgerSecretPath(databasePath), 'short');
    assert.throws(() => loadDatabaseSigningSecret(databasePath), {
      code: 'DATABASE_LEDGER_SIGNING_KEY_INVALID'
    });
    fs.writeFileSync(localToolMembraneSecretPath(databasePath), 'short');
    assert.throws(() => loadToolMembraneSigningSecret(databasePath), {
      code: 'TOOL_MEMBRANE_SIGNING_KEY_INVALID'
    });
    console.log('local database ledger secret checks passed');
  } finally {
    const db = require('../src/db');
    await db.closeDatabase();
    for (const [name, value] of Object.entries(original)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
