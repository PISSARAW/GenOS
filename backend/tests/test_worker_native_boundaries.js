'use strict';

const assert = require('node:assert/strict');
const registryBoundary = require('../src/services/agents/workerExecutorRegistry');
const kindBoundary = require('../src/services/agents/workerKindService');
for (const kind of ['constructor', '__proto__', 'toString']) {
  assert.equal(registryBoundary.hasNativeMethod(kind, undefined), false);
  assert.throws(() => require('../src/services/agents/workerContractEnforcement').assertWorkerToolAllowed({ identity: { workerKind: kind }, authority: { read: true } }, 'genos_inspect'), { code: 'WORKER_CONTRACT_DENIED' });
  assert.throws(() => kindBoundary.resolveWorkerKind(kind), { code: 'UNKNOWN_WORKER_KIND' });
}
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { fixtures, missionFor, method, hash } = require('./helpers/nativeWorkerFixtures');
const { executeNativeWorker, assertNativeInput } = require('../src/services/agents/workerExecutorRegistry');
const { validateWorkerArtifact } = require('../src/services/agents/workerArtifactContract');
const { reportFor } = require('../src/services/agents/deterministicWorkerRuntime');
const { buildWorkerContract } = require('../src/services/agents/workerKindService');

async function rejects(mission, code) {
  await assert.rejects(executeNativeWorker(mission.workerKind, mission.methodContract, { mission }), { code });
}

function assertInputBounds(inputs) {
  assert.throws(() => assertNativeInput('bounded_worker', method('scoped_procedure', {})), { code: 'WORKER_EXECUTOR_UNAVAILABLE' });
  assert.throws(() => assertNativeInput('creative_worker', method('combine_candidates', {
    ...inputs.creative_worker.parameters, dimensions: Array.from({ length: 4 }, (_, i) => ({ name: `d${i}`, options: ['a', 'b', 'c', 'd'] }))
  })), { code: 'WORKER_CREATIVE_INPUT_INVALID' });
  assert.throws(() => assertNativeInput('medical_worker', method('review_synthetic_case', {
    ...inputs.medical_worker.parameters, caseScope: 'real_patient'
  })), { code: 'WORKER_MEDICAL_INPUT_INVALID' });
  assert.throws(() => assertNativeInput('liaison_worker', method('prepare_handoff', {
    ...inputs.liaison_worker.parameters, targetGroup: 'producers'
  })), { code: 'WORKER_HANDOFF_INPUT_INVALID' });
  assert.throws(() => assertNativeInput('sub_orchestrator', method('coordinate_children', {
    children: [{ ...inputs.sub_orchestrator.parameters.children[0], workerKind: 'sub_orchestrator' }]
  })), { code: 'WORKER_COORDINATION_INPUT_INVALID' });
}

async function verifyContractBounds(root, inputs) {
  const specialist = missionFor('specialist', inputs.specialist, root);
  specialist.workerContract.mission.specialtyNiche = 'unrelated';
  await rejects(specialist, 'SPECIALIST_NICHE_MISMATCH');
  const host = missionFor('symbiotic_worker', inputs.symbiotic_worker, root);
  host.workerContract.mission.hostCapabilities = ['unrelated'];
  await rejects(host, 'SYMBIOTIC_HOST_CONTRACT_INVALID');
  const adaptive = missionFor('adaptive_worker', inputs.adaptive_worker, root);
  adaptive.workerContract.limits.maxStrategyChanges = 0;
  await rejects(adaptive, 'WORKER_STRATEGY_LIMIT');
  adaptive.workerContract.limits.maxIterations = 1;
  await rejects(adaptive, 'WORKER_ITERATION_LIMIT');
  assert.equal(buildWorkerContract('procedural_executor', { workerTokenLimit: 99999 }).resources.maxTokens, 0);
  assert.equal(buildWorkerContract('bounded_worker', { workerTokenLimit: 99999 }).resources.maxTokens, 8000);
}

async function verifyRecoveryBounds(root, inputs) {
  const recovery = missionFor('recovery_worker', inputs.recovery_worker, root);
  fs.writeFileSync(path.join(root, 'state.txt'), 'changed');
  await rejects(recovery, 'WORKER_RECOVERY_CONFLICT');
  assert.equal(fs.readFileSync(path.join(root, 'state.txt'), 'utf8'), 'changed');
  recovery.workerContract.mission.recoveryLease = null;
  await rejects(recovery, 'WORKER_CONTRACT_DENIED');
  const escaped = method('restore_checkpoint', { ...inputs.recovery_worker.parameters, path: '../escape.txt' });
  const escapeMission = missionFor('recovery_worker', escaped, root);
  escapeMission.workerContract.mission.recoveryLease.path = '../escape.txt';
  await rejects(escapeMission, 'WORKER_CONTRACT_DENIED');
  assert.throws(() => assertNativeInput('recovery_worker', method('restore_checkpoint', {
    ...inputs.recovery_worker.parameters, content: 'tampered'
  })), { code: 'WORKER_RECOVERY_INPUT_INVALID' });
  assert.equal(hash('checkpoint'), inputs.recovery_worker.parameters.checkpointDigest);
}

async function verifyArithmetic(root) {
  for (const claim of ['2 + 3 * 4 = 14', '9 % 4 = 1', '9007199254740993 > 9007199254740992', '2 ≤ 2', '3 >= 1']) {
    const input = method('check_arithmetic', { claim });
    const mission = missionFor('formal_worker', input, root);
    const result = await executeNativeWorker('formal_worker', input, { mission });
    assert.equal(result.result, 'proved');
    assert.equal(validateWorkerArtifact({ events: [{ evidenceReport: reportFor('formal_worker', result) }] }, mission), true);
  }
  await rejects(missionFor('formal_worker', method('check_arithmetic', { claim: '2 + 2 = 5' }), root), 'WORKER_FORMAL_CHECK_FAILED');
  await rejects(missionFor('formal_worker', method('check_arithmetic', { claim: '2 % 0 = 0' }), root), 'WORKER_FORMAL_INPUT_INVALID');
  assert.throws(() => assertNativeInput('formal_worker', method('check_arithmetic', { claim: 'True\naxiom fake : False' })), { code: 'WORKER_FORMAL_INPUT_INVALID' });
}

async function main() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'genos-worker-boundaries-'));
  try {
    const inputs = fixtures(root);
    assertInputBounds(inputs);
    await verifyContractBounds(root, inputs);
    await verifyRecoveryBounds(root, inputs);
    await verifyArithmetic(root);
    console.log('Native worker negative paths, exact arithmetic, host/scope/budget boundaries: PASS');
  } finally {
    assert.ok(root.startsWith(path.join(os.tmpdir(), 'genos-worker-boundaries-')));
    fs.rmSync(root, { recursive: true, force: true });
  }
}

main().catch((failure) => { console.error(failure); process.exitCode = 1; });
