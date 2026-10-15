'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const sqlite3 = require('sqlite3').verbose();
const { clinicalSignature } = require('../src/services/medical/therapyAuthorizationService');
const { revokeClinicalAuthorization } = require('../src/services/medical/clinicalTherapyService');

const SECRET = 'clinical-cross-process-test-secret';
const ADMIN = { isAuthenticated: true, permissions: ['all'], keyId: 'clinical-admin' };

function databaseAdapter(database) {
  const invoke = (mode, sql, params) => new Promise((resolve, reject) => {
    database[mode](sql, params, function callback(error, value) {
      if (error) return reject(error);
      resolve(mode === 'run' ? this : value);
    });
  });
  return {
    exec: sql => new Promise((resolve, reject) => database.exec(sql, error => error ? reject(error) : resolve())),
    run: (sql, ...params) => invoke('run', sql, params),
    get: (sql, ...params) => invoke('get', sql, params),
    all: (sql, ...params) => invoke('all', sql, params),
  };
}

function openDatabase(file) {
  const database = new sqlite3.Database(file);
  return { database, adapter: databaseAdapter(database) };
}

async function closeDatabase(database) {
  await new Promise((resolve, reject) => database.close(error => error ? reject(error) : resolve()));
}

function authorization(authorizationId) {
  const value = {
    approved: true, authorizationId, targetAgentId: 'clinical-target', approverId: 'approver-1',
    therapyType: 'watchful_waiting', expiresAt: Date.now() + 60000,
  };
  value.signature = clinicalSignature(value);
  return value;
}

function runWorker(mode, file, auth) {
  const result = spawnSync(process.execPath, [__filename, '--worker', mode, file, encodeURIComponent(JSON.stringify(auth))], {
    encoding: 'utf8', env: { ...process.env, GENOS_THERAPY_AUTH_SECRET: SECRET },
  });
  assert.equal(result.error, undefined, result.error?.message);
  return result;
}

async function seedAppliedAuthorization(file, auth) {
  const opened = openDatabase(file);
  await opened.adapter.exec(`CREATE TABLE clinical_treatment_authorizations (
    authorization_id TEXT PRIMARY KEY, signature TEXT NOT NULL, result_json TEXT NOT NULL
  )`);
  await opened.adapter.run(
    'INSERT INTO clinical_treatment_authorizations VALUES (?,?,?)',
    auth.authorizationId, auth.signature, JSON.stringify({ ok: true, treatmentId: 'treatment-1' })
  );
  await closeDatabase(opened.database);
}

async function worker(mode, file, auth) {
  process.env.GENOS_THERAPY_AUTH_SECRET = SECRET;
  const opened = openDatabase(file);
  try {
    if (mode === 'revoke') {
      const receipt = await revokeClinicalAuthorization(opened.adapter, { authorizationId: auth.authorizationId, actor: ADMIN });
      process.stdout.write(JSON.stringify(receipt));
      return;
    }
    const { applyTherapy } = require('../src/services/medical/clinicalTherapyService');
    const result = await applyTherapy(opened.adapter, auth.targetAgentId, { authorization: auth });
    process.stdout.write(JSON.stringify(result));
  } finally {
    await closeDatabase(opened.database);
  }
}

async function main() {
  process.env.GENOS_THERAPY_AUTH_SECRET = SECRET;
  const file = path.join(os.tmpdir(), `genos-clinical-revoke-${process.pid}-${Date.now()}.sqlite`);
  try {
    const replayAuth = authorization('clinical-replay-authorization');
    await seedAppliedAuthorization(file, replayAuth);
    const firstReplay = runWorker('apply', file, replayAuth);
    assert.equal(firstReplay.status, 0, firstReplay.stderr);
    assert.equal(JSON.parse(firstReplay.stdout).duplicate, true, 'valid replay remains idempotent before revocation');

    const firstRevocation = runWorker('revoke', file, replayAuth);
    assert.equal(firstRevocation.status, 0, firstRevocation.stderr);
    assert.equal(JSON.parse(firstRevocation.stdout).authorizationId, replayAuth.authorizationId);
    const repeatedRevocation = runWorker('revoke', file, replayAuth);
    assert.equal(repeatedRevocation.status, 0, repeatedRevocation.stderr);
    assert.equal(JSON.parse(repeatedRevocation.stdout).revokedBy, 'clinical-admin', 'revoke is idempotent across processes');

    const replayAfterRevoke = runWorker('apply', file, replayAuth);
    assert.equal(replayAfterRevoke.status, 1);
    assert.match(replayAfterRevoke.stderr, /CLINICAL_AUTHORIZATION_REVOKED/);

    const unusedAuth = authorization('clinical-unused-authorization');
    const unusedRevocation = runWorker('revoke', file, unusedAuth);
    assert.equal(unusedRevocation.status, 0, unusedRevocation.stderr);
    const firstUseAfterRevoke = runWorker('apply', file, unusedAuth);
    assert.equal(firstUseAfterRevoke.status, 1);
    assert.match(firstUseAfterRevoke.stderr, /CLINICAL_AUTHORIZATION_REVOKED/);

    await assert.rejects(
      revokeClinicalAuthorization({}, { authorizationId: 'forbidden', actor: { isAuthenticated: true, permissions: [], username: 'reader' } }),
      { code: 'CLINICAL_REVOCATION_FORBIDDEN' }
    );
    console.log('Clinical authorization revocation persists across OS processes; new use and replay fail closed: PASS');
  } finally {
    await fs.rm(file, { force: true });
    await fs.rm(`${file}-wal`, { force: true });
    await fs.rm(`${file}-shm`, { force: true });
  }
}

if (process.argv[2] === '--worker') {
  worker(process.argv[3], process.argv[4], JSON.parse(decodeURIComponent(process.argv[5])))
    .catch(error => { console.error(error.code ? `${error.code}: ${error.message}` : error.stack || error.message); process.exit(1); });
} else {
  main().catch(error => { console.error(error.stack || error.message); process.exit(1); });
}
