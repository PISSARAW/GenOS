'use strict';

const assert = require('node:assert/strict');
const { runProcedure } = require('../src/services/agents/deterministicWorkerProcedures');
const { sourceFor, runFormal } = require('../src/services/agents/deterministicWorkerFormal');
const { assertWorkerExecutorAvailable, applyWorkerRuntimeLimits } = require('../src/services/agents/workerRuntimeLimitsService');
const { buildWorkerContract } = require('../src/services/agents/workerKindService');
const { assertAssignmentMatches } = require('../src/services/agents/workerContractEnforcement');
const { applyTopologyWorkerKinds } = require('../src/services/topologyWorkerKindService');
const { validateWorkerArtifact } = require('../src/services/agents/workerArtifactContract');

const lpt = { version: 1, methodId: 'lpt', parameters: {
  jobs: [{ id: 'A', duration: 5 }, { id: 'B', duration: 4 }, { id: 'C', duration: 3 }], machines: 2
} };
const result = runProcedure(lpt);
assert.equal(result.output.makespan, 7);
assert.equal(result.receipt.result, result.output);
assert.match(result.receipt.id, /^solver:\/\/sha256:[a-f0-9]{64}$/);
assert.equal(runProcedure(lpt).receipt.id, result.receipt.id);
assert.notEqual(runProcedure({ ...lpt, parameters: { ...lpt.parameters, machines: 3 } }).receipt.id, result.receipt.id);
assert.throws(() => runProcedure({ ...lpt, parameters: { jobs: [{ id: 'A', duration: -1 }], machines: 2 } }), {
  code: 'WORKER_PROCEDURE_INPUT_INVALID'
});

const subset = runProcedure({ version: 1, methodId: 'subset_sum', parameters: { values: [3, 5, 7], target: 10 } });
assert.deepEqual(subset.output.indices, [0, 2]);
assert.equal(runProcedure({ version: 1, methodId: 'subset_sum', parameters: { values: [4, 6], target: 5 } }).output.found, false);
assert.throws(() => runProcedure({ version: 1, methodId: 'greedy', parameters: {} }), { code: 'WORKER_EXECUTOR_UNAVAILABLE' });

const mission = { workerKind: 'procedural_executor', methodContract: lpt,
  workerContract: buildWorkerContract('procedural_executor', { methodContract: lpt }), timeoutMs: 500000 };
assert.doesNotThrow(() => assertWorkerExecutorAvailable(mission));
const budget = applyWorkerRuntimeLimits(mission, { tokens: 5000, latencyMs: 500000 });
assert.equal(budget.tokens, 0);
assert.equal(mission.timeoutMs, 300000);
assert.throws(() => assertWorkerExecutorAvailable({ workerKind: 'procedural_executor', methodContract: { version: 1, methodId: 'greedy' } }), {
  code: 'WORKER_EXECUTOR_UNAVAILABLE'
});
assert.throws(() => assertAssignmentMatches(mission.workerContract, { methodContract: {
  ...lpt, parameters: { ...lpt.parameters, machines: 3 }
} }), { code: 'WORKER_METHOD_MISMATCH' });
const assigned = applyTopologyWorkerKinds('test', [{ role: 'implementation', methodContract: lpt }]);
assert.equal(assigned[0].workerKind, 'procedural_executor');

const formal = { version: 1, methodId: 'formal_proof', parameters: { claim: '2 + 2 = 4', toolchainVersion: 'Lean (version 4.0.0)' } };
assert.equal(sourceFor(formal.parameters), 'theorem genos_worker_claim : 2 + 2 = 4 := by decide\n');
assert.throws(() => sourceFor({ ...formal.parameters, claim: 'True\naxiom fake : False' }), { code: 'WORKER_FORMAL_INPUT_INVALID' });
assert.doesNotThrow(() => assertWorkerExecutorAvailable({ workerKind: 'formal_worker', methodContract: formal }));

async function checkFormal() {
  const passed = await runFormal(formal, { executor: async (request) => {
    assert.equal(request.strictToolchainVersion, true);
    return { exitCode: 0, axioms: [], toolchainVersion: request.toolchainVersion };
  } });
  assert.equal(passed.result, 'proved');
  assert.equal(passed.solverReceipt.claim, '2 + 2 = 4');
  const { reportFor } = require('../src/services/agents/deterministicWorkerRuntime');
  for (const [kind, output, contract] of [
    ['procedural_executor', result, mission.workerContract],
    ['formal_worker', passed, buildWorkerContract('formal_worker', { methodContract: formal })]
  ]) {
    const report = reportFor(kind, output);
    assert.equal(validateWorkerArtifact({ events: [{ evidenceReport: report }] }, {
      agentId: kind, workerContract: contract
    }), true);
  }
  await assert.rejects(runFormal(formal, { executor: async () => ({ exitCode: 1, axioms: [], stderr: 'unsolved goals' }) }), {
    code: 'WORKER_FORMAL_CHECK_FAILED'
  });
}

checkFormal().then(() => console.log('Deterministic worker runners: PASS')).catch((error) => { console.error(error); process.exitCode = 1; });
