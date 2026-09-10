const assert = require('assert');
process.env.GENOS_ADMIN_PASSWORD = 'TestPassword123!';
process.env.GENOS_ADMIN_TOKEN = 'TestAdminToken123!';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { getDatabase, closeDatabase, withTransaction } = require('../src/db');
const { isPathWithinRoot } = require('../src/services/workspaceRegistry');
const { terminateChild } = require('../src/services/processTermination');
const jobWorker = require('../src/services/jobWorker');

async function testWorkspaceRootProtection() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'genos-root-prot-'));
  try {
    assert.strictEqual(isPathWithinRoot(tmpDir, tmpDir), true);
    assert.strictEqual(isPathWithinRoot(tmpDir, tmpDir, { allowRoot: false }), false);
    const subDir = path.join(tmpDir, 'project-a');
    fs.mkdirSync(subDir);
    assert.strictEqual(isPathWithinRoot(tmpDir, subDir, { allowRoot: false }), true);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

async function testWithTransactionReentrancy() {
  const tmpDbPath = path.join(os.tmpdir(), `test-tx-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
  const db = await getDatabase(tmpDbPath);
  try {
    let innerRan = false;
    let outerRan = false;

    const result = await withTransaction(db, async (txDb) => {
      outerRan = true;
      assert.strictEqual(txDb, db);
      // Nested transaction call
      const innerResult = await withTransaction(db, async (innerDb) => {
        innerRan = true;
        assert.strictEqual(innerDb, db);
        return 'inner_success';
      });
      return `outer_${innerResult}`;
    });

    assert.strictEqual(outerRan, true);
    assert.strictEqual(innerRan, true);
    assert.strictEqual(result, 'outer_inner_success');
  } finally {
    await closeDatabase();
    try { fs.unlinkSync(tmpDbPath); } catch (_) {}
  }
}

async function testTerminateChildSafety() {
  // undefined / null child
  assert.strictEqual(terminateChild(null), false);
  assert.strictEqual(terminateChild(undefined), false);

  // child with missing or NaN pid
  assert.strictEqual(terminateChild({}), false);
  assert.strictEqual(terminateChild({ pid: undefined }), false);
  assert.strictEqual(terminateChild({ pid: 'not-a-number' }), false);
  assert.strictEqual(terminateChild({ pid: -1 }), false);
  assert.strictEqual(terminateChild({ pid: 0 }), false);

  // child already exited
  assert.strictEqual(terminateChild({ pid: 12345, exitCode: 0 }), false);
  assert.strictEqual(terminateChild({ pid: 12345, exitCode: null, signalCode: 'SIGTERM' }), false);
}

async function testStopJobWorkerWithRejectingJob() {
  const failingJob = new Promise((_, reject) => {
    setTimeout(() => reject(new Error('Simulated worker job crash')), 10);
  });
  failingJob.catch(() => {});
  const wrapped = failingJob.finally(() => jobWorker.inFlightJobs.delete(wrapped));

  jobWorker.inFlightJobs.add(wrapped);
  await jobWorker.stopJobWorker({ drain: true, timeoutMs: 500 });
  assert.strictEqual(jobWorker.inFlightJobs.size, 0);
}

async function runAll() {
  console.log('Running fatal bugs verification suite...');
  await testWorkspaceRootProtection();
  console.log('  ✓ testWorkspaceRootProtection passed');
  await testWithTransactionReentrancy();
  console.log('  ✓ testWithTransactionReentrancy passed');
  await testTerminateChildSafety();
  console.log('  ✓ testTerminateChildSafety passed');
  await testStopJobWorkerWithRejectingJob();
  console.log('  ✓ testStopJobWorkerWithRejectingJob passed');
  console.log('All fatal bugs unit tests passed successfully!');
}

runAll().catch((err) => {
  console.error('Fatal bugs verification failed:', err);
  process.exit(1);
});
