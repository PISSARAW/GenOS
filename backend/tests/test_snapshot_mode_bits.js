/**
 * Snapshot mode-bits hardening (workspaceSnapshotStore split).
 * Verifies: setuid/setgid/sticky always stripped, +x granted only under
 * bin/ or for shebang scripts, safe 0o644 fallback otherwise, plus a
 * content-faithful materialize round-trip.
 */
const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const snapshotPaths = require('../src/services/workspaceSnapshotPaths');
const snapshotStore = require('../src/services/workspaceSnapshotStore');

const { sanitizeFileMode, hasShebangPrefix, readShebangPrefix, isExecutablePath } = snapshotPaths;

function testExecutableEligibility() {
  assert.strictEqual(isExecutablePath('bin/run.sh'), true);
  assert.strictEqual(isExecutablePath('src/run.sh'), false);
  assert.strictEqual(hasShebangPrefix(Buffer.from('#!/bin/sh\necho hi')), true);
  assert.strictEqual(hasShebangPrefix(Buffer.from('echo hi')), false);
  assert.strictEqual(hasShebangPrefix(null), false);
  console.log('  PASS: bin/ and shebang eligibility detection.');
}

function testSanitizeModes() {
  const plain = Buffer.from('echo hi');
  const shebang = Buffer.from('#!/bin/sh\necho hi');
  assert.strictEqual(sanitizeFileMode(0o755, 'app.sh', plain), 0o644);
  assert.strictEqual(sanitizeFileMode(0o755, 'bin/app.sh', plain), 0o755);
  assert.strictEqual(sanitizeFileMode(0o755, 'app.sh', shebang), 0o755);
  assert.strictEqual(sanitizeFileMode(0o4755, 'bin/app.sh', plain), 0o755);
  assert.strictEqual(sanitizeFileMode(0o4755, 'app.sh', plain), 0o644);
  assert.strictEqual(sanitizeFileMode('garbage', 'app.sh', plain), 0o644);
  assert.strictEqual(sanitizeFileMode(0o644, 'app.sh', plain), 0o644);
  console.log('  PASS: setuid/sticky stripped, +x only for bin/ or shebang.');
}

async function testShebangPrefixRead() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'genos-mode-test-'));
  const script = path.join(dir, 'run.sh');
  fs.writeFileSync(script, '#!/bin/sh\necho hi');
  assert.strictEqual(await readShebangPrefix(script), true);
  fs.writeFileSync(script, 'echo hi');
  assert.strictEqual(await readShebangPrefix(script), false);
  assert.strictEqual(await readShebangPrefix(path.join(dir, 'missing.sh')), false);
  fs.rmSync(dir, { recursive: true, force: true });
  console.log('  PASS: two-byte shebang probe on real files.');
}

function sha256hex(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

async function testMaterializeRoundTrip() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'genos-mode-test-'));
  const payloadFiles = path.join(dir, 'payload', 'files');
  fs.mkdirSync(payloadFiles, { recursive: true });
  const content = Buffer.from('#!/bin/sh\necho hello');
  fs.writeFileSync(path.join(payloadFiles, 'run.sh'), content);
  const files = [{ path: 'run.sh', hash: sha256hex(content), size: content.length, mode: 0o755 }];
  const { manifestHash } = require('../src/services/workspaceSnapshotCollect');
  const hash = manifestHash(files);
  const manifestPath = path.join(dir, 'payload', 'manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify({ version: 1, hash, files }));
  const snapshot = { id: 'snp-test', snapshot_hash: hash, metadata: JSON.stringify({ manifestPath }) };
  const destination = path.join(dir, 'out');
  const manifest = await snapshotStore.materialize(snapshot, destination);
  assert.strictEqual(manifest.hash, hash);
  assert.strictEqual(fs.readFileSync(path.join(destination, 'run.sh'), 'utf8'), '#!/bin/sh\necho hello');
  if (process.platform !== 'win32') {
    const mode = fs.statSync(path.join(destination, 'run.sh')).mode & 0o777;
    assert.strictEqual(mode, 0o755, 'shebang script keeps its executable bit');
  }
  fs.rmSync(dir, { recursive: true, force: true });
  console.log('  PASS: materialize round-trip preserves content and shebang +x.');
}

async function run() {
  console.log('=== Snapshot mode-bits hardening ===');
  testExecutableEligibility();
  testSanitizeModes();
  await testShebangPrefixRead();
  await testMaterializeRoundTrip();
  console.log('SNAPSHOT MODE-BITS TESTS PASSED.');
}

run().catch((err) => {
  console.error('Snapshot mode-bits test failed:', err);
  process.exit(1);
});
