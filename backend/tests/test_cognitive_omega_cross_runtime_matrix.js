'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const matrix = require('../../spec/g-cir-omega-execution-matrix.json');
const { createRuntime } = require('../src/services/cognitiveOmegaRuntimeService');

const ROOT = path.resolve(__dirname, '../..');

function nodeExecution(testCase) {
  const runtime = createRuntime();
  runtime.registerSelector('runtime/request', ({ input }) => input);
  runtime.registerTool('runtime/execute', () => testCase.toolResults['runtime/execute']);
  runtime.registerInferer('model/runtime', () => testCase.inferenceResults['model/runtime']);
  runtime.registerVerifier('epistemic/runtime', () => testCase.verificationReceipts['epistemic/runtime']);
  runtime.registerEmitter('runtime.commit', () => testCase.emissionResults['runtime.commit']);
  return runtime.execute({ ...testCase.envelope, objects: testCase.objects, allowEmit: testCase.allowEmit });
}

function rustExecution(testCase) {
  const request = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'omega/execute', params: testCase });
  const processResult = spawnSync('cargo', ['run', '-p', 'genos-mcp', '--quiet'], {
    cwd: ROOT, input: `${request}\n`, encoding: 'utf8', timeout: 120000
  });
  assert.equal(processResult.error, undefined, processResult.error?.message);
  assert.equal(processResult.status, 0, processResult.stderr);
  const response = processResult.stdout.split(/\r?\n/).filter(Boolean).map(JSON.parse).find((item) => item.id === 1);
  assert.ok(response?.result, processResult.stdout);
  return response.result;
}

function comparable(result) {
  return { status: result.status, results: result.results.map(({ id, kind, status }) => ({ id, kind, status })), values: result.values };
}

(async () => {
  for (const testCase of matrix.cases) {
    const node = await nodeExecution(testCase);
    const rust = rustExecution(testCase);
    assert.deepEqual(node.results.map(({ id, kind, status }) => ({ id, kind, status })),
      testCase.expectedKinds.map((kind, index) => ({ id: testCase.envelope.operations[index].id, kind, status: testCase.expectedStatuses[index] })));
    assert.deepEqual(comparable(rust), comparable(node), testCase.name);
  }
  console.log('G-CIR Omega Node/Rust execution matrix passed.');
})().catch((error) => { console.error(error); process.exitCode = 1; });
