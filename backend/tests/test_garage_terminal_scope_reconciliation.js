'use strict';

const assert = require('node:assert/strict');
const { fixture, request } = require('./garageFixture');
const store = require('../src/services/garageQueueStore');
const runtime = require('../src/services/garageRuntimeService');

async function main() {
  const test = await fixture();
  const warnings = [];
  const originalWarn = console.warn;
  console.warn = (...args) => warnings.push(args.join(' '));
  try {
    const queued = await store.enqueuePersistent(test.db, request());
    const claim = await store.claimNextPersistent(test.db, { orchestratorId: 'orch' });
    await store.updatePersistent(test.db, {
      requestId: claim.request_id, leaseId: claim.lease_id, status: 'running'
    });
    await test.db.run("UPDATE agents SET status = 'error', parent_agent_id = NULL WHERE id = 'worker-1'");
    await runtime.reconcileOne({ db: test.db, isAlive: async () => false }, queued.request_id);
    const settled = await test.db.get('SELECT status, error_text FROM garage_queue WHERE request_id = ?', queued.request_id);
    assert.deepEqual(settled, {
      status: 'failed', error_text: 'garage_scope_invalid_at_terminal_reconciliation'
    });
    await runtime.reconcileOne({ db: test.db, isAlive: async () => false }, queued.request_id);
    assert.equal((await test.db.get('SELECT status FROM garage_queue WHERE request_id = ?', queued.request_id)).status, 'failed');
  } finally {
    await test.close();
    await new Promise((resolve) => setImmediate(resolve));
    console.warn = originalWarn;
  }
  assert.equal(warnings.some((warning) => /Database handle is closed/.test(warning)), false);
}

main().then(() => console.log('Garage terminal scope reconciliation: PASS'))
  .catch((failure) => { console.error(failure); process.exitCode = 1; });
