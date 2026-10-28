'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { MlirWorker, wslPath } = require('../adapters/mlir.cjs');

async function main() {
  const script = wslPath(path.join(__dirname, '..', 'adapters', 'mlir-runtime', 'worker.py'));
  const worker = new MlirWorker('wsl.exe', ['-d', 'Ubuntu', '--', 'python3', '-u', script]);
  try {
    const result = await worker.verify('module {\n  func.func @omega() { return }\n}\n', 1);
    assert.equal(result.ok, true);
    assert.equal(result.id, 1);
    assert.ok(result.latency_ms >= 0);
    assert.ok(result.output_bytes > 0);
    assert.match(result.optimized_ir_sha256, /^[a-f0-9]{64}$/);
  } finally {
    await worker.close();
  }
}

main().then(() => {
  process.stdout.write('OMEGA WSL-backed MLIR worker smoke test passed.\n');
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
