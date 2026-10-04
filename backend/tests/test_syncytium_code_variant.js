'use strict';

const assert = require('node:assert/strict');
const syncytium = require('../src/services/syncytiumCoordinationService');

async function main() {
  const session = await syncytium.createCodeSession('Share code with symbol-aware conflicts.');
  await syncytium.applyCodeChange(session.sessionId, {
    opId: 'code-math-1', actorId: 'author', filePath: 'src/math.js',
    expectedHash: null,
    content: 'export function add(a, b) { return a + b; }'
  });
  const consumer = await syncytium.applyCodeChange(session.sessionId, {
    opId: 'code-consumer-1', actorId: 'author', filePath: 'src/use.js',
    expectedHash: null,
    content: "import { add } from './math.js'; export function total(a, b) { return add(a, b); }"
  });
  assert.deepEqual(consumer.snapshot.sharedFields.files['src/use.js'].dependencies[0].symbols, ['add']);
  assert.deepEqual(consumer.snapshot.sharedFields.files['src/use.js'].astSummary.exportDeclarations, ['total']);

  await assert.rejects(syncytium.applyCodeChange(session.sessionId, {
    opId: 'code-remove-add', actorId: 'author', filePath: 'src/math.js',
    expectedHash: (await syncytium.codeSnapshot(session.sessionId)).code.files['src/math.js'].hash,
    content: 'export function sum(a, b) { return a + b; }'
  }), (error) => error.code === 'SYNCYTIUM_SEMANTIC_CONFLICT'
    && error.conflicts.some((conflict) => conflict.type === 'CODE_SYMBOL_REMOVED'));

  await assert.rejects(syncytium.applyCodeChange(session.sessionId, {
    opId: 'code-change-interface', actorId: 'author', filePath: 'src/math.js',
    expectedHash: (await syncytium.codeSnapshot(session.sessionId)).code.files['src/math.js'].hash,
    content: 'export function add(a, b, c) { return a + b + c; }'
  }), (error) => error.conflicts.some((conflict) => conflict.type === 'CODE_INTERFACE_CHANGED'));

  const math = (await syncytium.codeSnapshot(session.sessionId)).code.files['src/math.js'];
  await assert.rejects(syncytium.applyCodeChange(session.sessionId, {
    opId: 'code-stale', actorId: 'author', filePath: 'src/math.js', expectedHash: '0'.repeat(64), content: math.content
  }), (error) => error.code === 'SYNCYTIUM_CODE_STALE_WRITE');
  await assert.rejects(syncytium.applyCodeChange(session.sessionId, {
    opId: 'code-path', actorId: 'author', filePath: '../outside.js', expectedHash: null, content: ''
  }), (error) => error.code === 'SYNCYTIUM_CODE_PATH_INVALID');

  await syncytium.recordCodeTestResult(session.sessionId, {
    opId: 'test-result-1', actorId: 'ci', testId: 'unit', status: 'passed', count: 4
  });
  await syncytium.recordCodeBuildState(session.sessionId, {
    opId: 'build-result-1', actorId: 'ci', status: 'passed', revision: 'r1'
  });
  const state = await syncytium.codeSnapshot(session.sessionId);
  assert.equal(state.code.tests.unit.status, 'passed');
  assert.equal(state.code.build.status, 'passed');
  assert.equal((await syncytium.verifyMergeGate(session.sessionId)).mergeable, true);
  await syncytium.recordCodeBuildState(session.sessionId, {
    opId: 'build-result-broken', actorId: 'ci', status: 'failed', revision: 'r2'
  });
  assert.equal((await syncytium.verifyMergeGate(session.sessionId)).mergeable, false);
  await syncytium.recordCodeBuildState(session.sessionId, {
    opId: 'build-result-corrected', actorId: 'ci', status: 'passed', revision: 'r3'
  });
  assert.equal((await syncytium.verifyMergeGate(session.sessionId)).mergeable, true);

  const extra = await syncytium.applyCodeChange(session.sessionId, { opId: 'code-extra', actorId: 'author',
    filePath: 'src/extra.js', expectedHash: null, content: 'export function extra() { return true; }' });
  assert.equal(extra.snapshot.sharedFields.files['src/extra.js'].hash.length, 64);
  const staleGate = await syncytium.verifyMergeGate(session.sessionId);
  assert.equal(staleGate.mergeable, false);
  assert.ok(staleGate.reasons.includes('BUILD_STALE'));
  await syncytium.recordCodeTestResult(session.sessionId, {
    opId: 'test-result-current', actorId: 'ci', testId: 'unit-current', status: 'passed'
  });
  await syncytium.recordCodeBuildState(session.sessionId, {
    opId: 'build-result-current', actorId: 'ci', status: 'passed', revision: 'r4'
  });
  assert.equal((await syncytium.verifyMergeGate(session.sessionId)).mergeable, true);

  const locks = await syncytium.createCodeSession('Lock dependency closure atomically.');
  await syncytium.applyCodeChange(locks.sessionId, { opId: 'token-file', actorId: 'author', filePath: 'src/token.js',
    expectedHash: null, content: 'export function token() { return "t"; }' });
  const authContent = "import { token } from './token.js'; export function authenticate() { return token(); }";
  await syncytium.applyCodeChange(locks.sessionId, { opId: 'auth-file', actorId: 'author', filePath: 'src/auth.js',
    expectedHash: null, content: authContent });
  const apiContent = "import { authenticate } from './auth.js'; export function api() { return authenticate(); }";
  await syncytium.applyCodeChange(locks.sessionId, { opId: 'api-file', actorId: 'author', filePath: 'src/api.js',
    expectedHash: null, content: apiContent });
  const lock = await syncytium.acquireFileLock(locks.sessionId, { opId: 'acquire-api', actorId: 'lock-owner',
    filePath: 'src/api.js', ttlMs: 60000 });
  assert.deepEqual(lock.locked.sort(), ['src/api.js', 'src/auth.js', 'src/token.js']);
  const authHash = (await syncytium.codeSnapshot(locks.sessionId)).code.files['src/auth.js'].hash;
  await assert.rejects(syncytium.applyCodeChange(locks.sessionId, { opId: 'missing-token-auth', actorId: 'lock-owner',
    filePath: 'src/auth.js', expectedHash: authHash, content: authContent }),
  (error) => error.code === 'SYNCYTIUM_CODE_LOCK_CONFLICT');
  await assert.rejects(syncytium.applyCodeChange(locks.sessionId, { opId: 'blocked-auth', actorId: 'other',
    filePath: 'src/auth.js', expectedHash: authHash, content: authContent + '\n' }),
  (error) => error.code === 'SYNCYTIUM_CODE_LOCK_CONFLICT');
  await syncytium.releaseFileLock(locks.sessionId, { opId: 'release-api', actorId: 'lock-owner',
    filePath: 'src/api.js', lockToken: lock.lockToken });
}

main().then(() => console.log('Syncytium code variant checks: PASS')).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
