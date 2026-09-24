'use strict';

const assert = require('node:assert/strict');
const syncytium = require('../src/services/syncytiumCoordinationService');

async function main() {
  const session = await syncytium.createCodeSession('Share code with symbol-aware conflicts.');
  await syncytium.applyCodeChange(session.sessionId, {
    opId: 'code-math-1', actorId: 'author', filePath: 'src/math.js',
    content: 'export function add(a, b) { return a + b; }'
  });
  const consumer = await syncytium.applyCodeChange(session.sessionId, {
    opId: 'code-consumer-1', actorId: 'author', filePath: 'src/use.js',
    content: "import { add } from './math.js'; export function total(a, b) { return add(a, b); }"
  });
  assert.deepEqual(consumer.snapshot.sharedFields.files['src/use.js'].dependencies[0].symbols, ['add']);
  assert.deepEqual(consumer.snapshot.sharedFields.files['src/use.js'].astSummary.exportDeclarations, ['total']);

  await assert.rejects(syncytium.applyCodeChange(session.sessionId, {
    opId: 'code-remove-add', actorId: 'author', filePath: 'src/math.js',
    content: 'export function sum(a, b) { return a + b; }'
  }), (error) => error.code === 'SYNCYTIUM_SEMANTIC_CONFLICT'
    && error.conflicts.some((conflict) => conflict.type === 'CODE_SYMBOL_REMOVED'));

  await assert.rejects(syncytium.applyCodeChange(session.sessionId, {
    opId: 'code-change-interface', actorId: 'author', filePath: 'src/math.js',
    content: 'export function add(a, b, c) { return a + b + c; }'
  }), (error) => error.conflicts.some((conflict) => conflict.type === 'CODE_INTERFACE_CHANGED'));

  const math = (await syncytium.codeSnapshot(session.sessionId)).code.files['src/math.js'];
  await assert.rejects(syncytium.applyCodeChange(session.sessionId, {
    opId: 'code-stale', actorId: 'author', filePath: 'src/math.js', expectedHash: 'stale', content: math.content
  }), (error) => error.code === 'SYNCYTIUM_CODE_STALE_WRITE');
  await assert.rejects(syncytium.applyCodeChange(session.sessionId, {
    opId: 'code-path', actorId: 'author', filePath: '../outside.js', content: ''
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
}

main().then(() => console.log('Syncytium code variant checks: PASS')).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
