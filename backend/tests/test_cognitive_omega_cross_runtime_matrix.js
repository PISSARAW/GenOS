'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const matrix = require('../../spec/g-cir-omega-execution-matrix.json');
const { createRuntime } = require('../src/services/cognitiveOmegaRuntimeService');
const { cases } = require('./helpers/omegaExecutionCases');

const ROOT = path.resolve(__dirname, '../..');

function nodeExecution(testCase) {
  const runtime = createRuntime();
  const registrations = { toolResults: 'registerTool', inferenceResults: 'registerInferer',
    verificationReceipts: 'registerVerifier', emissionResults: 'registerEmitter' };
  for (const [field, method] of Object.entries(registrations)) {
    for (const [reference, value] of Object.entries(testCase[field])) runtime[method](reference, () => value);
  }
  return runtime.execute({ ...testCase.envelope, objects: testCase.objects, allowEmit: testCase.allowEmit });
}

function rustExecution(testCase) {
  const request = JSON.stringify(testCase);
  const processResult = spawnSync('cargo', ['run', '-p', 'genos-mcp', '--example', 'omega_execution_fixture', '--quiet'], {
    cwd: ROOT, input: `${request}\n`, encoding: 'utf8', timeout: 120000
  });
  assert.equal(processResult.error, undefined, processResult.error?.message);
  assert.equal(processResult.status, 0, processResult.stderr);
  const response = JSON.parse(processResult.stdout.trim());
  assert.ok(response?.status, processResult.stdout);
  return response;
}

function comparable(result) {
  return { status: result.status, reason: result.reason || null,
    results: result.results.map(({ id, kind, status }) => ({ id, kind, status })),
    values: result.status === 'blocked' ? null : result.values };
}

(async () => {
  for (const testCase of matrix.cases.flatMap(cases)) {
    const node = await nodeExecution(testCase);
    const rust = rustExecution(testCase);
    assert.deepEqual(node.results.map(({ id, kind, status }) => ({ id, kind, status })),
      testCase.expectedKinds.map((kind, index) => ({ id: testCase.envelope.operations[index].id, kind, status: testCase.expectedStatuses[index] })));
    assert.deepEqual(comparable(rust), comparable(node), testCase.name);
    assert.equal(node.reason, testCase.expectedReason);
  }
  console.log('G-CIR Omega Node/Rust execution matrix passed.');
})().catch((error) => { console.error(error); process.exitCode = 1; });
