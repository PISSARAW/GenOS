'use strict';

const { parentPort, workerData } = require('node:worker_threads');
const kernel = require('./axolotlRuntimeKernel');
const started = performance.now();
try {
  parentPort.postMessage({ ...kernel.evaluate(workerData), durationMs: performance.now() - started });
} catch (failure) {
  parentPort.postMessage({ passed: false, code: failure.code || 'AXOLOTL_PROBE_FAILED', durationMs: performance.now() - started });
}
