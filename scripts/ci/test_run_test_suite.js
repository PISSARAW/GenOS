'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { acquireTestLock, assertMinimumSpace, releaseTestLock } = require('./run_test_suite');

function verifyLockOwnership(root) {
  const lock = path.join(root, 'suite.lock');
  acquireTestLock(lock, 'owner-one');
  assert.throws(() => acquireTestLock(lock, 'owner-two'), /already owns/);
  releaseTestLock(lock, 'owner-two');
  assert.equal(fs.existsSync(lock), true);
  releaseTestLock(lock, 'owner-one');
  assert.equal(fs.existsSync(lock), false);
}

function verifyDeadOwnerRecovery(root) {
  const lock = path.join(root, 'stale.lock');
  fs.writeFileSync(lock, JSON.stringify({ pid: 1, token: 'stale' }));
  acquireTestLock(lock, 'replacement', () => false);
  releaseTestLock(lock, 'replacement');
  assert.equal(fs.existsSync(lock), false);
}

function verifyMalformedLockBlocks(root) {
  const lock = path.join(root, 'malformed.lock');
  fs.writeFileSync(lock, JSON.stringify({ pid: 'unknown', token: 'bad' }));
  assert.throws(() => acquireTestLock(lock, 'replacement'), /unreadable owner metadata/);
  assert.equal(fs.existsSync(lock), true);
}

function verifyDiskThreshold() {
  assert.doesNotThrow(() => assertMinimumSpace(512n, 512n, 'fixture volume'));
  assert.throws(() => assertMinimumSpace(10n * 1024n * 1024n,
    512n * 1024n * 1024n, 'fixture volume'), /requires 512 MiB free/);
}

function run() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'genos-test-run-guard-'));
  try {
    verifyLockOwnership(root);
    verifyDeadOwnerRecovery(root);
    verifyMalformedLockBlocks(root);
    verifyDiskThreshold();
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

run();
console.log('Test serialization, stale-owner recovery and disk guard: PASS');
