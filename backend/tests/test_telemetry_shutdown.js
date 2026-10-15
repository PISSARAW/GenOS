'use strict';

const assert = require('node:assert/strict');
const shutdown = require('../src/services/telemetryShutdownService');

async function run() {
  const order = [];
  const result = await shutdown.closeAfterFlush({
    telemetry: { flush: async () => { order.push('flush'); return { flushed: true, pending: 0 }; } },
    closeDatabase: async () => { order.push('close'); }
  });
  assert.deepEqual(order, ['flush', 'close']);
  assert.equal(result.flushed, true);

  let closed = false;
  await assert.rejects(shutdown.closeAfterFlush({
    telemetry: { flush: async () => ({ flushed: false, pending: 2 }) },
    closeDatabase: async () => { closed = true; }
  }), { code: 'TELEMETRY_SHUTDOWN_INCOMPLETE', pending: 2 });
  assert.equal(closed, true);
}

run().then(() => console.log('Orchestrator shutdown flushes telemetry before closing SQLite.'))
  .catch((error) => { console.error(error); process.exit(1); });
