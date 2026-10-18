'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const registry = require('../src/services/foundationalTrustRegistry');
const revocations = require('../src/services/foundationalRevocationAuthority');

const NOW = '2026-10-18T13:30:00.000Z';

function pair() {
  const keys = crypto.generateKeyPairSync('ed25519');
  return { privateKey: keys.privateKey,
    publicKey: keys.publicKey.export({ type: 'spki', format: 'pem' }) };
}

function authority(id, keys, status = 'active') {
  return { id, status, publicKey: keys.publicKey };
}

function body(options) {
  const times = options.times || {};
  return { schema: registry.PACKAGE_SCHEMA, generation: options.generation,
    previousPackageHash: options.previousPackageHash,
    issuedAt: times.issuedAt || '2026-10-18T13:00:00.000Z',
    expiresAt: times.expiresAt || '2026-10-19T13:00:00.000Z',
    authorities: options.authorities };
}

function signed(root, packageBody) {
  return registry.signPackage({ body: packageBody, rootPrivateKey: root.privateKey,
    rootKeyId: registry.keyId(root.publicKey) });
}

function writeCandidate(paths, value) {
  fs.writeFileSync(paths.candidate, `${JSON.stringify(value, null, 2)}\n`);
}

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'genos-foundational-trust-'));
  return { root, candidate: path.join(root, 'candidate.json'),
    active: path.join(root, 'active.json'), recovery: path.join(root, 'recovery.json') };
}

function install(paths, rootTrust) {
  return registry.install({ candidatePath: paths.candidate, activePath: paths.active,
    recoveryPath: paths.recovery, rootTrust, now: NOW });
}

function main() {
  const paths = fixture();
  const root = pair();
  const authorityA = pair();
  const authorityB = pair();
  const rootTrust = { id: registry.keyId(root.publicKey), publicKey: root.publicKey };
  try {
    const first = signed(root, body({ generation: 1, previousPackageHash: null,
      authorities: [authority('authority-a', authorityA)] }));
    writeCandidate(paths, first);
    const installedFirst = install(paths, rootTrust);
    assert.equal(installedFirst.body.generation, 1);
    assert.deepEqual(registry.runtimeRegistry(installedFirst).authorities
      .map(({ id }) => id), ['authority-a']);
    assert.ok(!JSON.stringify(first).includes('PRIVATE KEY'));

    rejectInvalidCandidates({ paths, root, rootTrust, active: installedFirst, authorityA });

    const overlap = signed(root, body({ generation: 2,
      previousPackageHash: installedFirst.packageHash,
      authorities: [authority('authority-a', authorityA), authority('authority-b', authorityB)] }));
    writeCandidate(paths, overlap);
    const installedOverlap = install(paths, rootTrust);
    assert.deepEqual(registry.runtimeRegistry(installedOverlap).authorities
      .map(({ id }) => id), ['authority-a', 'authority-b']);

    const revoked = signed(root, body({ generation: 3,
      previousPackageHash: installedOverlap.packageHash,
      authorities: [authority('authority-a', authorityA, 'revoked'),
        authority('authority-b', authorityB)] }));
    writeCandidate(paths, revoked);
    const installedRevocation = install(paths, rootTrust);
    assert.deepEqual(registry.runtimeRegistry(installedRevocation).authorities
      .map(({ id }) => id), ['authority-b']);
    verifyRuntimeRevocation(installedRevocation, authorityA, authorityB);

    verifyRecovery(paths, rootTrust, installedRevocation);
    verifyCliBootstrap(root, authorityA);
    console.log('Foundational trust registry: signed bootstrap, overlap, revocation and recovery PASS.');
  } finally {
    fs.rmSync(paths.root, { recursive: true, force: true });
  }
}

function verifyRuntimeRevocation(trustPackage, authorityA, authorityB) {
  const trustRegistry = registry.runtimeRegistry(trustPackage);
  const common = { receiptHash: 'a'.repeat(64), reason: 'counter-evidence',
    sequence: 1, revokedAt: '2026-10-18T13:20:00.000Z' };
  const accepted = revocations.issue({ ...common, authorityId: 'authority-b',
    privateKey: authorityB.privateKey });
  assert.equal(revocations.inspect({ ledger: { schema: revocations.LEDGER_SCHEMA,
    revocations: [accepted] }, trustRegistry, now: NOW }).valid, true);
  const retired = revocations.issue({ ...common, authorityId: 'authority-a',
    privateKey: authorityA.privateKey });
  assert.equal(revocations.inspect({ ledger: { schema: revocations.LEDGER_SCHEMA,
    revocations: [retired] }, trustRegistry, now: NOW }).valid, false);
}

function rejectInvalidCandidates(context) {
  const { paths, root, rootTrust, active, authorityA } = context;
  const original = fs.readFileSync(paths.active, 'utf8');
  const unknownRoot = pair();
  assert.throws(() => registry.verifyPackage({ package: active,
    rootTrust: { id: registry.keyId(unknownRoot.publicKey), publicKey: unknownRoot.publicKey },
    now: NOW }), { code: 'FOUNDATION_TRUST_ROOT_INVALID' });
  const tampered = structuredClone(active);
  tampered.body.authorities[0].id = 'forged';
  writeCandidate(paths, tampered);
  assert.throws(() => install(paths, rootTrust),
    { code: 'FOUNDATION_TRUST_PACKAGE_TAMPERED' });
  assert.equal(fs.readFileSync(paths.active, 'utf8'), original);

  assert.throws(() => signed(root, body({ generation: 2,
    previousPackageHash: active.packageHash, authorities: [] })),
    { code: 'FOUNDATION_TRUST_AUTHORITY_INVALID' });
  const stale = signed(root, body({ generation: 2, previousPackageHash: active.packageHash,
    authorities: [authority('authority-a', authorityA)],
    times: { issuedAt: '2026-10-16T00:00:00.000Z',
      expiresAt: '2026-10-17T00:00:00.000Z' } }));
  assert.throws(() => registry.verifyPackage({ package: stale, rootTrust, now: NOW }),
    { code: 'FOUNDATION_TRUST_PACKAGE_STALE' });

  const skipped = signed(root, body({ generation: 3,
    previousPackageHash: active.packageHash,
    authorities: [authority('authority-a', authorityA)] }));
  writeCandidate(paths, skipped);
  assert.throws(() => install(paths, rootTrust),
    { code: 'FOUNDATION_TRUST_LINEAGE_INVALID' });
  assert.equal(fs.readFileSync(paths.active, 'utf8'), original);
}

function verifyRecovery(paths, rootTrust, expected) {
  fs.writeFileSync(paths.active, '{broken');
  const recovered = registry.loadActive({ activePath: paths.active,
    recoveryPath: paths.recovery, rootTrust, now: NOW });
  assert.equal(recovered.packageHash, expected.packageHash);
  assert.equal(JSON.parse(fs.readFileSync(paths.active, 'utf8')).packageHash,
    expected.packageHash);
  fs.rmSync(paths.active);
  fs.rmSync(paths.recovery);
  assert.throws(() => registry.loadActive({ activePath: paths.active,
    recoveryPath: paths.recovery, rootTrust, now: NOW }),
  { code: 'FOUNDATION_TRUST_PACKAGE_UNAVAILABLE' });
}

function verifyCliBootstrap(root, authorityA) {
  const paths = fixture();
  try {
    const rootTrust = { id: registry.keyId(root.publicKey), publicKey: root.publicKey };
    const candidate = signed(root, body({ generation: 1, previousPackageHash: null,
      authorities: [authority('authority-a', authorityA)],
      times: { issuedAt: '2020-01-01T00:00:00.000Z',
        expiresAt: '2099-01-01T00:00:00.000Z' } }));
    writeCandidate(paths, candidate);
    const script = path.resolve(__dirname, '../bin/activate-foundational-trust-package.cjs');
    const result = spawnSync(process.execPath,
      [script, paths.candidate, paths.active, paths.recovery], { encoding: 'utf8',
        env: { ...process.env, GENOS_FOUNDATIONAL_TRUST_ROOT_JSON: JSON.stringify(rootTrust) } });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(result.stdout).generation, 1);
  } finally {
    fs.rmSync(paths.root, { recursive: true, force: true });
  }
}

if (require.main === module) main();
module.exports = { main };
