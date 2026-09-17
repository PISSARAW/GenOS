const assert = require('node:assert/strict');
const dispatch = require('../src/services/orchestratorDispatchService');
const service = require('../src/grpc_services/orchestratorService');
const { getDatabase } = require('../src/db');

async function call(request) {
  return new Promise((resolve) => service.DispatchWorker({ request }, (_error, response) => resolve(response)));
}

async function main() {
  const runtimeAdapter = require('../src/services/agentRuntimeAdapter');
  const originalStartMission = runtimeAdapter.startMission;
  const calls = [];
  runtimeAdapter.startMission = async (mission) => {
    calls.push(mission);
    return { started: true };
  };
  try {
    const db = await getDatabase();
    await db.run(`INSERT OR REPLACE INTO agents (id, name, role, status, execution_mode, parent_agent_id) VALUES ('grpc-dispatch-orch', 'gRPC test orchestrator', 'orchestrator', 'idle', 'orchestrator', NULL)`);
    await db.run(`INSERT OR REPLACE INTO agents (id, name, role, status, execution_mode, parent_agent_id) VALUES ('grpc-dispatch-worker', 'gRPC test worker', 'worker', 'idle', 'worker', 'grpc-dispatch-orch')`);
    const response = await call({ orchestrator_id: 'grpc-dispatch-orch', worker_id: 'grpc-dispatch-worker', prompt: 'run checks', workspace_id: 'ws-1', timeout_ms: 5000 });
    assert.equal(response.success, true);
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0], dispatch.buildWorkerMission({
      agentId: 'grpc-dispatch-worker',
      orchestratorAgentId: 'grpc-dispatch-orch',
      prompt: 'run checks',
      workspaceId: 'ws-1',
      timeoutMs: 5000,
      modelTier: 'Flash'
    }));
    const invalid = await call({ orchestrator_id: 'grpc-dispatch-orch', worker_id: 'grpc-dispatch-worker' });
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
