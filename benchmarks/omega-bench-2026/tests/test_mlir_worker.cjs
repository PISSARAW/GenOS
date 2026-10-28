'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { MlirWorker, wslPath } = require('../adapters/mlir.cjs');

async function testSequentialRequestsStayBoundToTheirResponses() {
  const fixture = path.join(__dirname, 'fixtures', 'mlir-worker-child.cjs');
  const worker = new MlirWorker(process.execPath, [fixture]);
  try {
    const first = await worker.verify('module {\n}', 11);
    const second = await worker.verify('module {\n  func.func @f() { return }\n}', 12);
    assert.equal(first.id, 11);
    assert.equal(second.id, 12);
    assert.equal(first.latency_ms, 0.25);
    assert.equal(second.output_bytes, Buffer.byteLength('module {\n  func.func @f() { return }\n}'));
  } finally {
    await worker.close();
  }
}

function testWslPathUsesMountedDrive() {
  const result = wslPath('C:\\work\\omega\\worker.py');
  assert.equal(result, '/mnt/c/work/omega/worker.py');
}

testWslPathUsesMountedDrive();
testSequentialRequestsStayBoundToTheirResponses().then(() => {
  process.stdout.write('OMEGA persistent MLIR worker protocol passed.\n');
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
