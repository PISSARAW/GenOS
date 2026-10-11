'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { fixtures, missionFor } = require('./helpers/nativeWorkerFixtures');
const registry = require('../src/services/agents/workerExecutorRegistry');
const { KINDS } = require('../src/services/agents/workerKindService');
const { reportFor } = require('../src/services/agents/deterministicWorkerRuntime');
const { validateWorkerArtifact } = require('../src/services/agents/workerArtifactContract');
const { assertAssignmentMatches, assertRuntimeContract } = require('../src/services/agents/workerContractEnforcement');
const { isDeterministicWorkerMission, applyWorkerRuntimeLimits } = require('../src/services/agents/workerRuntimeLimitsService');

async function verifyMission(mission) {
  assertRuntimeContract(mission.workerContract, mission.workerKind);
  if (mission.workerKind === 'sub_orchestrator') {
    assert.equal(mission.workerContract.resources.maxTokens, 0);
    assert.ok(mission.workerContract.resources.maxDelegatedTokens > 0);
  }
  assert.equal(isDeterministicWorkerMission(mission), true);
  assert.equal(applyWorkerRuntimeLimits(mission, { tokens: 8000, latencyMs: 300000 }).tokens, 0);
  const context = { db: {}, mission, deadline: Date.now() + 300000 };
  const result = await registry.executeNativeWorker(mission.workerKind, mission.methodContract, context);
  const report = reportFor(mission.workerKind, result);
  assert.equal(validateWorkerArtifact({ events: [{ evidenceReport: report }] }, mission), true);
  const invalid = structuredClone(report);
  invalid.workerArtifact.type = 'wrong_type';
  assert.throws(() => validateWorkerArtifact({ events: [{ evidenceReport: invalid }] }, mission), { code: 'INVALID_WORKER_ARTIFACT' });
  invalid.workerArtifact.type = report.workerArtifact.type;
  invalid.workerArtifact.provenance = { sourceRefs: [] };
  assert.throws(() => validateWorkerArtifact({ events: [{ evidenceReport: invalid }] }, mission), { code: 'INVALID_WORKER_ARTIFACT' });
  assert.throws(() => assertAssignmentMatches(mission.workerContract, { methodContract: {
    ...mission.methodContract, parameters: { ...mission.methodContract.parameters, injected: true }
  } }), { code: 'WORKER_METHOD_MISMATCH' });
  console.log(`Native ${mission.workerKind}: PASS`);
}

async function main() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'genos-worker-native-'));
  const dispatch = require('../src/services/agents/subOrchestratorDispatchService');
  const original = dispatch.dispatchSubOrchestratorWorker;
  const inputs = fixtures(root);
  // The child method executes for real; persistence and supervisor transport are
  // separately covered by the sub-orchestrator dispatch/integration tests.
  dispatch.dispatchSubOrchestratorWorker = async (_db, parentId, child) => {
    assert.equal(parentId, 'native-sub_orchestrator');
    const mission = missionFor(child.workerKind, child.methodContract, root);
    const result = await registry.executeNativeWorker(child.workerKind, child.methodContract, { mission });
    return { childAgentId: 'native-child', success: true, status: 'completed',
      supervision: { success: true, evidenceReport: reportFor(child.workerKind, result) } };
  };
  try {
    assert.deepEqual(registry.executorCatalog().map((entry) => entry.kind).sort(), Object.keys(KINDS).sort());
    assert.deepEqual(Object.keys(inputs).sort(), Object.keys(KINDS).sort());
    fs.writeFileSync(path.join(root, 'state.txt'), 'damaged');
    for (const [kind, method] of Object.entries(inputs)) await verifyMission(missionFor(kind, method, root));
    assert.equal(fs.readFileSync(path.join(root, 'state.txt'), 'utf8'), 'checkpoint');
    console.log('Native worker matrix: 19/19 executable methods and typed evidence passed.');
  } finally {
    dispatch.dispatchSubOrchestratorWorker = original;
    assert.ok(root.startsWith(path.join(os.tmpdir(), 'genos-worker-native-')));
    fs.rmSync(root, { recursive: true, force: true });
  }
}

main().catch((failure) => { console.error(failure); process.exitCode = 1; });
