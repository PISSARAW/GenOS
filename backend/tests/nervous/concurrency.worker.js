'use strict';

const { parentPort, workerData } = require('node:worker_threads');
const { harness, event, SCOPE } = require('./helpers');

async function main() {
  const h = await harness({ filename: workerData.filename });
  try {
    for (let i = 0; i < 15; i += 1) {
      await h.runtime.ingest(event(`thread-${workerData.index}-${i}`, { eventType: 'AGENT_FAILED' }), SCOPE);
    }
    parentPort.postMessage({ success: true });
  } finally { await h.store.close(); }
}

main().catch(error => { throw error; });
