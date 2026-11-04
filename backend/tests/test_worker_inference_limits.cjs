'use strict';
const assert = require('node:assert/strict');
const limits = require('../src/services/workerInferenceLimits');
const repair = require('../src/services/workerCodeTestRepair');
const stages = require('../src/services/workerEvidenceBarrierLocalValues1');
const details = require('../src/services/workerLocalStageDetails');
const mission = { localCodeWorker: true, executionBudget: { tokens: 8192, latencyMs: 120000 },
  executionPolicy: { inferenceLimits: { attempts: 1, outputTokens: 1536 } } };
async function main() {
  assert.equal(limits.resolve({}), null);
  assert.deepEqual(limits.resolve(mission), { attempts: 1, outputTokens: 1536 });
  assert.equal(details.outputCap(mission), 1536);
  assert.equal(details.outputCap({ ...mission, workerKind: 'resource_steward' }), 768);
  assert.equal(details.outputCap({ ...mission, identityExperimentScenario: true }), 1024);
  assert.equal(stages.runGenerationStageValue2({ ctx: { mission } }), 1536);
  const envelope = limits.authorityBinding(mission);
  limits.assertAuthority(envelope, mission);
  const changed = structuredClone(mission);
  changed.executionPolicy.inferenceLimits.attempts = 2;
  assert.throws(() => limits.assertAuthority(envelope, changed), { code: 'EXECUTION_AUTHORITY_CONTEXT_CHANGED' });
  assert.throws(() => limits.assertAuthority(envelope, {}), { code: 'EXECUTION_AUTHORITY_CONTEXT_CHANGED' });
  for (const attempts of [0, -1, 1.5, 27, '1']) {
    assert.throws(() => limits.resolve({ executionPolicy: { inferenceLimits: { attempts, outputTokens: 1536 } } }),
      { code: 'WORKER_INFERENCE_LIMIT_INVALID' });
  }
  let calls = 0;
  const failure = Object.assign(new Error('Real test failed'), { code: 'WORKER_TESTS_FAILED', usage: { tokens: 10 } });
  await assert.rejects(repair.run({ mission, runAttempt: async () => { calls++; throw failure; } }), error => error === failure);
  assert.equal(calls, 1, 'A failed test is retained without a second generation or artificial success');
  console.log('Inference ceilings: output cap, one failed attempt, invalid limits and sealed-context tampering: PASS');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
