'use strict';

const assert = require('node:assert/strict');
const { runProcess } = require('../src/services/epistemicScheduler/leanProcessExecutor');
const { runFormal } = require('../src/services/agents/deterministicWorkerFormal');
const { executeNativeWorker } = require('../src/services/agents/workerExecutorRegistry');

const method = { version: 1, methodId: 'formal_proof',
  parameters: { claim: '2 + 2 = 4', toolchainVersion: 'deadline-test' } };

async function processBudget() {
  const deadlineAt = Date.now() + 300;
  const first = await runProcess(process.execPath, ['-e', 'setTimeout(() => {}, 5000)'],
    { deadlineAt, timeout: 5000, windowsHide: true });
  assert.equal(first.timedOut, true);
  assert.notEqual(first.exitCode, 0);
  const second = await runProcess('missing-lean-executable', [], { deadlineAt, timeout: 5000 });
  assert.equal(second.reason, 'lean_deadline_exceeded');
  assert.equal(second.timedOut, true);
  await assert.rejects(runFormal(method, { executor: async () => second }), error =>
    error.code === 'WORKER_FORMAL_CHECK_FAILED' && /deadline exceeded/.test(error.message));
}

async function workerBudget() {
  const formal = require('../src/services/agents/deterministicWorkerFormal');
  const previous = formal.runFormal;
  formal.runFormal = async (_method, options) => options;
  try {
    const normal = await executeNativeWorker('formal_worker', method, { deadline: Date.now() + 180000 });
    assert.equal(normal.timeoutMs, 90000);
    const short = await executeNativeWorker('formal_worker', method, { deadline: Date.now() + 5000 });
    assert.ok(short.timeoutMs > 0 && short.timeoutMs <= 5000);
  } finally { formal.runFormal = previous; }
}

async function main() {
  await processBudget(); await workerBudget();
  console.log('Lean shared deadline, stopped dispatch, honest timeout and native worker budget: PASS');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
