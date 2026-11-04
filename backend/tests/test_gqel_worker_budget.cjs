'use strict';
process.env.GENOS_DISABLE_DOTENV = '1';
const assert = require('node:assert/strict');
const { buildWorkerMission } = require('../src/services/orchestratorDispatchService');
const { applyWorkerRuntimeLimits } = require('../src/services/agents/workerRuntimeLimitsService');
const { exceededGuardrail } = require('../src/services/strategyExecutionEvents');

function mission(tokens, qualityBudget = 160000) {
  return buildWorkerMission({ workerKind: 'creative_worker', prompt: 'Write and independently review a complete screenplay.',
    executionBudget: { tokens }, qualityElevation: { domain: 'screenplay', budgetMaxTokens: qualityBudget } });
}

const allocated = mission(100000);
const enforcement = require('../src/services/agents/workerContractEnforcement');
assert.equal(allocated.workerContract.mission.qualityTokenAllocation, 100000);
assert.doesNotThrow(() => enforcement.assertRuntimeContract(allocated.workerContract, 'creative_worker'));
const forged = structuredClone(allocated.workerContract);
forged.resources.maxTokens = 100001;
assert.throws(() => enforcement.assertRuntimeContract(forged, 'creative_worker'), { code: 'INVALID_WORKER_CONTRACT' });
const stripped = structuredClone(allocated.workerContract);
delete stripped.mission.qualityTokenAllocation;
assert.throws(() => enforcement.assertRuntimeContract(stripped, 'creative_worker'), { code: 'INVALID_WORKER_CONTRACT' });
const budget = applyWorkerRuntimeLimits(allocated, { tokens: 100000, latencyMs: 1800000 });
assert.equal(budget.tokens, 100000);
assert.equal(allocated.workerContract.resources.maxTokens, 100000);
assert.equal(allocated.workerContract.limits.maxQualityTokens, undefined);
assert.equal(exceededGuardrail({ tokens: 67083, billableTokens: 67083 }, budget), null);
assert.match(exceededGuardrail({ tokens: 100001, billableTokens: 100001 }, budget), /tokens budget exceeded/);
assert.equal(mission(60000).workerContract.resources.maxTokens, 60000);
assert.equal(mission(300000).workerContract.resources.maxTokens, 160000);
assert.equal(mission(100000, 50000).workerContract.resources.maxTokens, 50000);
assert.equal(mission(100000, 10000).workerContract.resources.maxTokens, 10000);
assert.equal(mission(10000).workerContract.resources.maxTokens, 10000);
const ordinary = buildWorkerMission({ workerKind: 'creative_worker', prompt: 'Write.', executionBudget: { tokens: 100000 } });
assert.equal(ordinary.workerContract.resources.maxTokens, 40000);
assert.equal(buildWorkerMission({ workerKind: 'creative_worker', prompt: 'Write.', qualityElevation: { domain: 'screenplay' } })
  .workerContract.resources.maxTokens, 8000);
assert.equal(buildWorkerMission({ workerKind: 'verifier_worker', prompt: 'Inspect.', executionBudget: { tokens: 100000 },
  qualityElevation: { domain: 'generic' } }).workerContract.resources.maxTokens, 40000);
const cliContract = require('../bin/orchestratorActions.cjs').buildWorkerContract({
  workerKinds: require('../src/services/agents/workerKindService'), workerKind: 'creative_worker',
  context: { task: 'Write.', orchestratorId: 'root' }, request: {
    execution_budget: { tokens: 100000, latencyMs: 3600000 }, qualityElevation: allocated.qualityElevation } });
assert.equal(cliContract.resources.maxTokens, 100000);
assert.equal(cliContract.resources.maxTimeMs, 3600000);
assert.equal(cliContract.mission.timeoutMs, 3600000);
assert.doesNotThrow(() => enforcement.assertRuntimeContract(cliContract, 'creative_worker'));
const twoHours = 7200000;
const extended = buildWorkerMission({ workerKind: 'creative_worker', prompt: 'Write and review.', timeoutMs: twoHours,
  executionBudget: { tokens: 600000, latencyMs: twoHours }, qualityElevation: {
    domain: 'screenplay', budgetMaxTokens: 500000, maxDurationMs: 3600000 } });
assert.equal(extended.workerContract.resources.maxTokens, 160000, 'The policy token cap is preserved.');
assert.equal(extended.workerContract.resources.maxTimeMs, twoHours);
assert.equal(extended.workerContract.mission.timeoutMs, twoHours);
assert.doesNotThrow(() => enforcement.assertRuntimeContract(extended.workerContract, 'creative_worker'));
const nativeBudget = applyWorkerRuntimeLimits(extended, { tokens: 600000, latencyMs: twoHours });
assert.equal(nativeBudget.tokens, 160000);
assert.equal(nativeBudget.latencyMs, twoHours);
assert.equal(extended.timeoutMs, twoHours);
for (const timeoutMs of [0, -1, Infinity, twoHours * 13, 100.5]) {
  assert.throws(() => buildWorkerMission({ workerKind: 'creative_worker', prompt: 'Write.', timeoutMs }),
    { code: 'INVALID_WORKER_TIME_ALLOCATION' });
}

async function persistedAllocation() {
  let metadata;
  const db = { get: async () => null, run: async (...args) => { metadata = JSON.parse(args.at(-1)); } };
  await require('../src/services/topology/workerLauncher.cjs').persistWorkerIdentity({ db,
    context: { orchestratorId: 'root', request: { timeoutMs: 3600000, execution_budget: { tokens: 300000, latencyMs: 3600000 } } },
    member: { role: 'literary_author', mission: 'Write.', executionBudgetTokens: 100000,
      qualityElevation: allocated.qualityElevation }, parent: { workspace_id: 'workspace' }, workerId: 'author' });
  assert.equal(metadata.workerContract.resources.maxTokens, 100000);
  assert.equal(metadata.workerContract.resources.maxTimeMs, 3600000);
  assert.equal(metadata.workerContract.mission.timeoutMs, 3600000);
  assert.doesNotThrow(() => enforcement.assertRuntimeContract(metadata.workerContract, 'creative_worker'));
  assert.equal(metadata.workerContract.qualityElevation.digest, allocated.qualityElevation.digest);
  const contract = metadata.workerContract;
  const inflated = structuredClone(contract);
  inflated.resources.maxTimeMs++;
  assert.throws(() => enforcement.assertRuntimeContract(inflated, 'creative_worker'), { code: 'INVALID_WORKER_CONTRACT' });
  const strippedTime = structuredClone(contract);
  delete strippedTime.mission.timeoutMs;
  assert.throws(() => enforcement.assertRuntimeContract(strippedTime, 'creative_worker'), { code: 'INVALID_WORKER_CONTRACT' });
  console.log('Native creative quality budgets retain allocation through CLI and persisted topology identity, respect all caps, and still refuse cumulative overruns: PASS');
}
persistedAllocation().catch(error => { console.error(error); process.exitCode = 1; });
