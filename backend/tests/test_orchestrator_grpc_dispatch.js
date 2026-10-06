'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const service = require('../src/grpc_services/orchestratorService');
const { getDatabase, closeDatabase } = require('../src/db');
function call(request) {
  return new Promise((resolve, reject) => service.DispatchWorker({ request }, (error, response) => error ? reject(error) : resolve(response)));
}
async function main() {
  const runtime = require('../src/services/agentRuntimeAdapter');
  const lifecycle = require('../src/services/agentWorkspaceLifecycleService');
  const originalStart = runtime.startMission, originalIsolate = lifecycle.createIsolatedWorkspace;
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'genos-grpc-orchestrator-'));
  const calls = [], isolations = [];
  runtime.startMission = async (mission) => { calls.push(mission); return { started: true }; };
  lifecycle.createIsolatedWorkspace = async (source, worker) => {
    isolations.push({ source, worker });
    return path.join(directory, 'isolated');
  };
  try {
    const db = await getDatabase();
    await db.run("INSERT OR IGNORE INTO organizations (id, name) VALUES ('grpc-org', 'gRPC fixture')");
    await db.run("INSERT OR IGNORE INTO projects (id, organization_id, name) VALUES ('grpc-project', 'grpc-org', 'gRPC fixture')");
    await db.run("INSERT OR REPLACE INTO workspaces (id, name, path, organization_id, project_id) VALUES (?, 'gRPC fixture', ?, ?, ?)", 'grpc-ws', directory, 'grpc-org', 'grpc-project');
    await db.run("INSERT OR REPLACE INTO agents (id, name, role, status, execution_mode) VALUES ('grpc-orch', 'test', 'orchestrator', 'idle', 'orchestrator')");
    await db.run("INSERT OR REPLACE INTO agents (id, name, role, status, execution_mode, parent_agent_id, workspace_id, isolation_mode) VALUES ('grpc-worker', 'test', 'worker', 'idle', 'worker', 'grpc-orch', 'grpc-ws', 'Branch')");
    const request = { orchestrator_id: 'grpc-orch', worker_id: 'grpc-worker', prompt: 'run checks', organization_id: 'grpc-org', project_id: 'grpc-project', timeout_ms: 5000 };
    const response = await call(request);
    assert.equal(response.success, true);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].workerKind, 'bounded_worker');
    assert.equal(calls[0].workspaceRoot, path.join(directory, 'isolated'));
    assert.equal(calls[0].workspaceProvisioned, true);
    assert.equal(calls[0].workspaceId, 'grpc-ws');
    assert.deepEqual(isolations, [{ source: directory, worker: 'grpc-worker' }]);
    await assert.rejects(call({ ...request, organization_id: 'other-tenant' }), (error) => error.code === 9 && /tenant scope/.test(error.message));
    await assert.rejects(call({ ...request, worker_id: 'unassigned' }), (error) => error.code === 9 && /not assigned/.test(error.message));
    await assert.rejects(call({ ...request, prompt: '' }), (error) => error.code === 3);
    await assert.rejects(call({ ...request, workspace_id: 'external-workspace' }), (error) => error.code === 9);
    await assert.rejects(call({ ...request, timeout_ms: -1 }), (error) => error.code === 3);
    assert.equal(calls.length, 1);
    assert.equal(isolations.length, 1);
    console.log('gRPC dispatch preserves tenant scope, assignment, isolation and RPC errors.');
  } finally {
    runtime.startMission = originalStart;
    lifecycle.createIsolatedWorkspace = originalIsolate;
    await closeDatabase();
    fs.rmSync(directory, { recursive: true, force: true });
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
