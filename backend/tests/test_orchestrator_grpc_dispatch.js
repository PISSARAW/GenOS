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
  const bindings = require('../src/services/workerWorkspaceBindingService');
  const originalStart = runtime.startMission, originalIsolate = lifecycle.createIsolatedWorkspace;
  const originalBind = bindings.bindWorkerWorkspace;
  const originalCleanup = lifecycle.cleanupWorkspace, originalForget = lifecycle.forgetWorkspace;
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'genos-grpc-orchestrator-'));
  const calls = [], isolations = [], bindingsSeen = [], cleanups = [];
  runtime.startMission = async (mission) => {
    calls.push(mission);
    if (mission.prompt.includes('fail after bind')) throw new Error('dispatch failed');
    return { started: true };
  };
  lifecycle.createIsolatedWorkspace = async (source, worker) => {
    isolations.push({ source, worker });
    return path.join(directory, 'isolated');
  };
  lifecycle.cleanupWorkspace = async workspace => { cleanups.push(workspace); return 'removed'; };
  lifecycle.forgetWorkspace = async () => {};
  try {
    const db = await getDatabase();
    bindings.bindWorkerWorkspace = async (database, input) => {
      bindingsSeen.push(input);
      await database.run(`INSERT OR REPLACE INTO workspaces
        (id,name,path,visibility,tags,organization_id,project_id)
        VALUES ('grpc-capsule','capsule',?,'Private','["worker_capsule"]','grpc-org','grpc-project')`, input.workspaceRoot);
      await database.run("UPDATE agents SET workspace_id='grpc-capsule' WHERE id=?", input.workerId);
      return 'grpc-capsule';
    };
    await db.run("INSERT OR IGNORE INTO organizations (id, name) VALUES ('grpc-org', 'gRPC fixture')");
    await db.run("INSERT OR IGNORE INTO projects (id, organization_id, name) VALUES ('grpc-project', 'grpc-org', 'gRPC fixture')");
    const source = path.join(directory, 'source');
    fs.mkdirSync(source);
    await db.run("INSERT OR REPLACE INTO workspaces (id,name,path,visibility,organization_id,project_id) VALUES ('grpc-parent-ws','parent',?,'Private','grpc-org','grpc-project')", directory);
    await db.run("INSERT OR REPLACE INTO workspaces (id,name,path,visibility,organization_id,project_id) VALUES ('grpc-source-ws','source',?,'Private','grpc-org','grpc-project')", source);
    await db.run("INSERT OR REPLACE INTO agents (id,name,role,status,execution_mode,workspace_id) VALUES ('grpc-orch','test','orchestrator','idle','orchestrator','grpc-parent-ws')");
    const metadata = JSON.stringify({ workerKind: 'bounded_worker', workerContract: {
      mission: { scope: source, methodContract: { version: 1, methodId: 'prompt_defined' } }
    } });
    await db.run(`INSERT OR REPLACE INTO agents
      (id,name,role,status,execution_mode,parent_agent_id,workspace_id,isolation_mode,metadata_json)
      VALUES ('grpc-worker','test','worker','idle','worker','grpc-orch','grpc-source-ws','Branch',?)`, metadata);
    await db.run("INSERT OR REPLACE INTO agents (id,name,role,status,execution_mode,workspace_id) VALUES ('grpc-not-orch','test','worker','idle','worker','grpc-parent-ws')");
    await db.run(`INSERT OR REPLACE INTO agents
      (id,name,role,status,execution_mode,parent_agent_id,workspace_id,isolation_mode)
      VALUES ('grpc-invalid-child','test','worker','idle','worker','grpc-not-orch','grpc-source-ws','Branch')`);
    await db.run("INSERT OR REPLACE INTO missions (mission_id,objective,orchestrator_agent_id) VALUES ('grpc-mission','test','grpc-orch')");
    await db.run("INSERT OR REPLACE INTO mission_agents (mission_id,agent_id,role) VALUES ('grpc-mission','grpc-orch','orchestrator'),('grpc-mission','grpc-worker','worker')");
    const request = { orchestrator_id: 'grpc-orch', worker_id: 'grpc-worker', prompt: 'run checks', organization_id: 'grpc-org', project_id: 'grpc-project', timeout_ms: 5000 };
    await assert.rejects(call({ ...request, organization_id: 'other-tenant' }), error => error.code === 9 && /tenant scope/.test(error.message));
    await assert.rejects(call({ ...request, organization_id: '' }), error => error.code === 3);
    await assert.rejects(call({ ...request, worker_id: 'unassigned' }), error => error.code === 9 && /not assigned/.test(error.message));
    await assert.rejects(call({ ...request, orchestrator_id: 'grpc-not-orch', worker_id: 'grpc-invalid-child' }),
      error => error.code === 9 && /not assigned/.test(error.message));
    await assert.rejects(call({ ...request, prompt: '' }), error => error.code === 3);
    await assert.rejects(call({ ...request, workspace_id: 'external-workspace' }), error => error.code === 3);
    await assert.rejects(call({ ...request, timeout_ms: -1 }), error => error.code === 3);
    const response = await call(request);
    assert.equal(response.success, true);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].workerKind, 'bounded_worker');
    assert.equal(calls[0].workspaceRoot, path.join(directory, 'isolated'));
    assert.equal(calls[0].workspaceProvisioned, true);
    assert.equal(calls[0].workspaceId, 'grpc-capsule');
    assert.equal(calls[0].missionId, 'grpc-mission');
    assert.equal(calls[0].workerContract.mission.scope, path.join(directory, 'isolated'));
    assert.deepEqual(bindingsSeen[0], { workerId: 'grpc-worker', parentId: 'grpc-orch',
      parentWorkspaceId: 'grpc-parent-ws', workspaceRoot: path.join(directory, 'isolated') });
    const persisted = await db.get("SELECT metadata_json FROM agents WHERE id='grpc-worker'");
    assert.equal(JSON.parse(persisted.metadata_json).workerContract.mission.scope, path.join(directory, 'isolated'));
    await db.run("UPDATE agents SET workspace_id='grpc-source-ws',metadata_json=? WHERE id='grpc-worker'", metadata);
    await db.run("DELETE FROM workspaces WHERE id='grpc-capsule'");
    await assert.rejects(call({ ...request, prompt: 'fail after bind' }), error => error.code === 9);
    const rolledBack = await db.get("SELECT workspace_id,metadata_json FROM agents WHERE id='grpc-worker'");
    assert.equal(rolledBack.workspace_id, 'grpc-source-ws');
    assert.equal(rolledBack.metadata_json, metadata);
    assert.equal(await db.get("SELECT id FROM workspaces WHERE id='grpc-capsule'"), undefined);
    assert.deepEqual(cleanups, [path.join(directory, 'isolated')]);
    assert.equal(calls.length, 2);
    assert.equal(isolations.length, 2);
    console.log('gRPC dispatch preserves tenant scope, assignment, isolation and RPC errors.');
  } finally {
    runtime.startMission = originalStart;
    lifecycle.createIsolatedWorkspace = originalIsolate;
    lifecycle.cleanupWorkspace = originalCleanup;
    lifecycle.forgetWorkspace = originalForget;
    bindings.bindWorkerWorkspace = originalBind;
    await closeDatabase();
    fs.rmSync(directory, { recursive: true, force: true });
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
