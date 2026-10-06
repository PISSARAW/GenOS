'use strict';

const assert = require('node:assert/strict');
const biome = require('../src/services/biomeCoordinationService');

async function run() {
  let calls = 0;
  const environment = { opportunities: [{ id: 'calculate', descriptor: 'Compute a local value',
    evidenceRefs: ['test:calculation-task'], opportunityScore: 1, requiredCapabilities: ['calculate'],
    resourceProfile: { tokens: { minimum: 1, preferred: 20, maximum: 100 } } }] };
  const runtime = await biome.BiomeRuntime.create('Execute a bounded population task', {
    variant: 'resource', maxTicks: 10, environment,
    authorizeExecution: async () => true,
    executors: { local: async request => { calls += 1; return {
      output: request.input.left + request.input.right, consumed: { tokens: 2 }
    }; } },
    verifyExecution: async proof => ({ ...proof, verified: proof.output === 4, evidenceRefs: ['test:arithmetic-check'] })
  });
  await runtime.step({ totalBudget: 100, resources: { tokens: 100 },
    individuals: [{ individualId: 'calculator', capabilities: ['calculate'] }] });
  const request = { executionId: 'sum-1', populationId: 'population:niche-calculate',
    individualId: 'calculator', providerId: 'local', capability: 'calculate',
    resources: { tokens: 5 }, input: { left: 2, right: 2 } };
  const completed = await biome.executeSessionWork(runtime.sessionId, request, runtime.options);
  assert.equal(completed.execution.status, 'verified');
  assert.equal(completed.execution.output, 4);
  assert.equal(completed.execution.consumed.tokens, 2);
  let snapshot = await biome.sessionSnapshot(runtime.sessionId);
  assert.equal(snapshot.ecologicalState.runtime.budgetUsed, 2);
  assert.equal(snapshot.archive[0].artifact, 4);
  const replayed = await biome.executeSessionWork(runtime.sessionId, request, runtime.options);
  assert.equal(replayed.status, 'verified');
  assert.equal(calls, 1);
  const denied = await biome.executeSessionWork(runtime.sessionId, { ...request, executionId: 'sum-denied' }, {
    ...runtime.options, authorizeExecution: async () => false
  });
  assert.equal(denied.status, 'abstained');
  assert.equal(calls, 1);
  const unverified = await biome.executeSessionWork(runtime.sessionId, { ...request, executionId: 'sum-2' }, {
    ...runtime.options, verifyExecution: async proof => ({ ...proof, verified: true, outputDigest: 'wrong', evidenceRefs: ['forged'] })
  });
  assert.equal(unverified.execution.status, 'unverified');
  await assert.rejects(() => biome.executeSessionWork(runtime.sessionId, { ...request, input: { left: 3, right: 1 } }, runtime.options), {
    code: 'BIOME_EXECUTION_ID_CONFLICT'
  });
  const failed = await biome.executeSessionWork(runtime.sessionId, { ...request, executionId: 'sum-3' }, {
    ...runtime.options, executors: { local: async () => { throw new Error('provider failed'); } }
  });
  assert.equal(failed.execution.status, 'failed');
  snapshot = await biome.sessionSnapshot(runtime.sessionId);
  assert.equal(snapshot.ecologicalState.runtime.budgetUsed, 9);
  assert.equal(snapshot.archive.length, 1);
  const uncertain = await biome.executeSessionWork(runtime.sessionId, { ...request, executionId: 'sum-timeout' }, {
    ...runtime.options, executionTimeoutMs: 20, executors: { local: () => new Promise(() => {}) }
  });
  assert.equal(uncertain.execution.status, 'indeterminate');
  assert.equal((await biome.executeSessionWork(runtime.sessionId, { ...request, executionId: 'sum-timeout' }, runtime.options)).status, 'indeterminate');
  const overrun = await biome.executeSessionWork(runtime.sessionId, { ...request, executionId: 'sum-overrun' }, {
    ...runtime.options, executors: { local: async () => ({ output: 4, consumed: { tokens: 6 } }) }
  });
  assert.equal(overrun.execution.status, 'failed');
  assert.equal(overrun.execution.consumed.tokens, 6);
  assert.equal((await biome.sessionSnapshot(runtime.sessionId)).ecologicalState.runtime.budgetUsed, 20);
  console.log('Biome real adapter reservation, refunds, transport/proof separation and replay protection: PASS');
}
run().catch(error => { console.error(error); process.exitCode = 1; });
