'use strict';
const assert = require('node:assert/strict');
const { workerLaunchPayload } = require('../bin/workerLaunchPayload.cjs');
const { buildWorkerMission } = require('../src/services/orchestratorDispatchService');
const repair = require('../src/services/workerCodeTestRepair');
const { isCodeWorkerMission } = require('../src/services/workerEvidenceLocalPrompt');

function child(flag, inferenceLimits = { attempts: 3, outputTokens: 2048 }) {
  const launch = workerLaunchPayload({ context: { request: { localCodeWorker: flag,
    executionPolicy: { inferenceLimits },
    executionBudget: { tokens: 20000, latencyMs: 10000 } } },
  member: { role: 'implementation', workerKind: 'bounded_worker', mission: 'Fix and verify.' },
  workerId: 'code-repair-child', parent: {} });
  return buildWorkerMission({ ...launch, agentId: launch.workerId, prompt: launch.mission,
    executionBudget: launch.execution_budget,
    executionPolicy: require('../bin/directWorkerPolicy.cjs').workerPolicy(launch) });
}

function testFailure(attempt) {
  const assertion = ['next integer', 'input preservation', 'export contract'][attempt - 1];
  return Object.assign(new Error('Visible assertion failed'), { code: 'WORKER_TESTS_FAILED',
    usage: { tokens: 100 }, proposal: { tests: [{ command: 'npm test', exitCode: 1,
      stderr: `AssertionError: ${assertion} failed` }] } });
}

async function main() {
  const enabled = child(true);
  assert.equal(enabled.localCodeWorker, true);
  assert.equal(isCodeWorkerMission(enabled), true);
  assert.deepEqual(enabled.executionPolicy.inferenceLimits, { attempts: 3, outputTokens: 2048 });
  assert.equal(enabled.executionBudget.tokens, 20000);
  for (const attempts of [0, 27, 1.5, NaN, null]) {
    assert.throws(() => child(true, { attempts, outputTokens: 2048 }), { code: 'WORKER_INFERENCE_LIMIT_INVALID' });
  }
  assert.throws(() => require('../bin/directWorkerPolicy.cjs').workerPolicy({
    executionPolicy: { inferenceLimits: { attempts: 27, outputTokens: 2048 } }
  }), { code: 'WORKER_INFERENCE_LIMIT_INVALID' });
  let attempts = 0;
  const result = await repair.run({ mission: enabled, runAttempt: async mission => {
    attempts += 1;
    if (attempts === 1) throw testFailure(attempts);
    assert.equal(mission.executionBudget.tokens, 19900);
    return 'repaired';
  } });
  assert.equal(result, 'repaired');
  assert.equal(attempts, 2);
  attempts = 0;
  await assert.rejects(repair.run({ mission: enabled, runAttempt: async () => {
    attempts += 1; throw testFailure(attempts);
  } }), { code: 'WORKER_TESTS_FAILED' });
  assert.equal(attempts, 3, 'The launch flag must not increase the inference attempt limit.');
  for (const flag of [undefined, false, 'true', 1]) {
    attempts = 0;
    const disabled = child(flag);
    assert.equal(disabled.localCodeWorker, false);
    await assert.rejects(repair.run({ mission: disabled, runAttempt: async () => {
      attempts += 1; throw testFailure(attempts);
    } }), { code: 'WORKER_TESTS_FAILED' });
    assert.equal(attempts, 1, 'Absent, false and non-boolean flags do not enable code repair.');
  }
  console.log('Explicit code-worker launch preserves bounded repair, strict booleans and inference ceilings: PASS');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
