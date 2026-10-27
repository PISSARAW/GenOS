'use strict';

const assert = require('node:assert/strict');
const { run, failureFeedback } = require('../src/services/workerCodeTestRepair');
const { parseProposal } = require('../src/services/localCodeWorkerService');

const mission = { localCodeWorker: true,
  prompt: 'Do not modify tests; repair implementation only.', timeoutMs: 10000,
  executionBudget: { latencyMs: 10000, tokens: 20000 } };
const unsafe = JSON.stringify({ format: 'genos.file-replacement/v1',
  patches: [{ path: 'backend/tests/test_worker_evidence_local_artifact.js', content: 'weakened test' }],
  tests: ['node backend/tests/test_worker_evidence_local_artifact.js'], evidence: 'test repair' });
let rejected;
try { parseProposal(unsafe, { inputTokens: 70, outputTokens: 30 }); }
catch (error) { rejected = error; }
assert.equal(rejected?.code, 'WORKER_OUTPUT_SCHEMA_VIOLATION');
const feedback = failureFeedback(rejected);
assert.match(feedback, /test file and cannot be patched/);
assert.match(feedback, /repair the production implementation instead/);
const prompts = [];
async function main() {
  const result = await run({ mission, runAttempt: async (attemptMission) => {
  prompts.push(attemptMission);
  if (prompts.length === 1) throw rejected;
  return 'implementation patch accepted';
  } });
  assert.equal(result, 'implementation patch accepted');
  assert.match(prompts[1].prompt, /Unsafe patch proposal/);
  assert.match(prompts[1].prompt, /test_worker_evidence_local_artifact\.js/);
  assert.match(prompts[1].prompt, /repair the production implementation instead/);
  assert.equal(prompts[1].executionBudget.tokens, 19900);
  let repeated = 0;
  await assert.rejects(run({ mission, runAttempt: async () => {
    repeated += 1;
    throw rejected;
  } }), (error) => error.code === 'WORKER_TEST_REPAIR_NO_PROGRESS'
    && error.originalError === rejected && error.repairProgress.identicalFailures === 2);
  assert.equal(repeated, 2, 'identical failures stop after the configured no-progress limit');
  process.stdout.write('Unsafe code proposals are rejected and returned to the model for a bounded retry.\n');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
