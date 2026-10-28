'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

async function testScopedLedgerPersistsRetryExactlyOnce() {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'omega-ledger-test-'));
  const globalLedger = path.join(temporary, 'activity-ledger.json');
  process.env.OMEGA_TEMPORAL_LEDGER = globalLedger;
  const { completeTask } = require('../adapters/temporal-runtime/activities');
  const scopeOne = 'workflow/../scope-one';
  const scopeTwo = 'workflow/scope-two';
  const directory = `${globalLedger}.scopes`;
  const fileOne = path.join(directory,
    `${crypto.createHash('sha256').update(scopeOne).digest('hex')}.json`);
  const fileTwo = path.join(directory,
    `${crypto.createHash('sha256').update(scopeTwo).digest('hex')}.json`);
  try {
    await assert.rejects(completeTask({ scope: scopeOne, taskId: 'task-1',
      effectKey: 'effect-1', failOnce: true }), /Injected crash after durable effect/);
    const afterFailure = fs.readFileSync(fileOne, 'utf8');
    const durableState = JSON.parse(afterFailure);
    assert.equal(Object.keys(durableState.failed).length, 1);
    assert.equal(Object.keys(durableState.effects).length, 1);
    assert.equal(Object.keys(durableState.completed).length, 1);

    const retry = await completeTask({ scope: scopeOne, taskId: 'task-1',
      effectKey: 'effect-1', failOnce: true });
    assert.deepEqual(retry, { taskId: 'task-1' });
    assert.equal(fs.readFileSync(fileOne, 'utf8'), afterFailure);

    await completeTask({ scope: scopeTwo, taskId: 'task-1',
      effectKey: 'effect-1', failOnce: false });
    const scopedState = JSON.parse(fs.readFileSync(fileTwo, 'utf8'));
    assert.equal(fs.existsSync(globalLedger), false);
    assert.notEqual(fileOne, fileTwo);
    assert.equal(path.dirname(fileOne), path.resolve(directory));
    assert.equal(Object.keys(scopedState.completed).length, 1);
    assert.equal(fs.readFileSync(fileOne, 'utf8'), afterFailure);
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
    delete process.env.OMEGA_TEMPORAL_LEDGER;
  }
}

testScopedLedgerPersistsRetryExactlyOnce().then(() => {
  process.stdout.write('OMEGA scoped Temporal ledger retry and isolation passed.\n');
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
