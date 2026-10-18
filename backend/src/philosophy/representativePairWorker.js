'use strict';

const { parentPort } = require('node:worker_threads');
const { runRepresentativePair } = require('./representativeMissionExperiments');

parentPort.once('message', (input) => {
  try {
    if (!input?.contract || !input.workerId || !input.dispatchNonce) {
      throw new Error('PHILOSOPHY_WORKER_INPUT_INVALID');
    }
    parentPort.postMessage({
      kind: 'philosophy-worker-result', workerId: input.workerId,
      dispatchNonce: input.dispatchNonce,
      comparison: runRepresentativePair(input.contract),
    });
  } catch (error) {
    parentPort.postMessage({ kind: 'philosophy-worker-error', error: error.message });
  }
});
