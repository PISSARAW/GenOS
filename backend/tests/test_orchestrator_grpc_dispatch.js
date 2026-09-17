const assert = require('node:assert/strict');
const runtimeAdapter = require('../src/services/agentRuntimeAdapter');
const service = require('../src/grpc_services/orchestratorService');

async function call(request) {
  return new Promise((resolve) => service.DispatchWorker({ request }, (_error, response) => resolve(response)));
}

async function main() {
  const originalStartMission = runtimeAdapter.startMission;
  const calls = [];
  runtimeAdapter.startMission = async (mission) => {
    calls.push(mission);
    return { started: true };
  };
  try {
    const response = await call({ orchestrator_id: 'orch-1', worker_id: 'worker-1', prompt: 'run checks', workspace_id: 'ws-1', timeout_ms: 5000 });
    assert.equal(response.success, true);
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0], {
      agentId: 'worker-1',
      orchestratorAgentId: 'orch-1',
      prompt: 'run checks',
      role: 'worker',
      workspaceId: 'ws-1',
      modelTier: undefined,
      timeoutMs: 5000,
      autonomousOrchestration: false
    });
    const invalid = await call({ orchestrator_id: 'orch-1', worker_id: 'worker-1' });
    assert.equal(invalid.success, false);
    assert.equal(calls.length, 1);
    console.log('Orchestrator gRPC dispatch starts the shared runtime and rejects incomplete requests.');
  } finally {
    runtimeAdapter.startMission = originalStartMission;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
