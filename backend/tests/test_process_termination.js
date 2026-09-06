const assert = require('node:assert/strict');
const { terminateChild } = require('../src/services/processTermination');

process.env.GENOS_PROCESS_GRACE_MS = '0';
const signals = [];
const child = {
  exitCode: null,
  signalCode: null,
  kill(signal) {
    signals.push(signal);
    if (signal === 'SIGKILL') this.signalCode = signal;
  }
};

assert.equal(terminateChild(child), true);
setTimeout(() => {
  assert.deepEqual(signals, ['SIGTERM', 'SIGKILL']);
  delete process.env.GENOS_PROCESS_GRACE_MS;
  console.log('Process termination checks passed.');
}, 10);
