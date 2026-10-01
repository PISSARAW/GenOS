'use strict';
const { Worker } = require('node:worker_threads');
const { abortable } = require('./operationDeadline');

async function runImageTask(input) {
  input.signal?.throwIfAborted();
  const worker = new Worker(input.workerPath || require.resolve('./foragingImageWorker'), { workerData: input.data });
  const result = new Promise((resolve, reject) => {
    worker.once('message', message => message.error ? reject(new Error(message.error)) : resolve(message.result));
    worker.once('error', reject);
    worker.once('exit', code => { if (code !== 0) reject(new Error(`Image worker exited: ${code}`)); });
  });
  try {
    return await abortable(result, input.signal, () => worker.terminate());
  } finally {
    await worker.terminate();
  }
}
module.exports = { runImageTask };
