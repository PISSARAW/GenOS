'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { provision } = require('../bin/provision-gvx-ledger-key.cjs');

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'genos-ledger-key-'));

try {
  const dbPath = path.join(directory, 'genos.db');
  const secretPath = provision(dbPath);
  const secret = fs.readFileSync(secretPath, 'utf8');
  assert.match(secret, /^[a-f0-9]{64}$/);
  assert.throws(() => provision(dbPath), { code: 'EEXIST' });
  assert.equal(fs.readFileSync(secretPath, 'utf8'), secret,
    'reprovisioning must not replace an existing signing key');
  console.log('GVX ledger signing key provisioning: ok');
} finally {
  fs.rmSync(directory, { recursive: true, force: true });
}
