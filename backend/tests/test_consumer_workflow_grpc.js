'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const grpc = require('@grpc/grpc-js');
const { getDatabase, closeDatabase } = require('../src/db');
const { guardService } = require('../src/grpc_services/grpcAuth');
const loadProtos = require('../proto');
const handler = require('../src/grpc_services/workflowService');

function status(client, request, authenticated = true) {
  const metadata = new grpc.Metadata();
  if (authenticated) metadata.set('x-genos-grpc-key', process.env.GENOS_GRPC_SHARED_SECRET);
  return new Promise((resolve, reject) => client.GetWorkflowStatus(request, metadata,
    (error, result) => error ? reject(error) : resolve(result)));
}

async function main() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'genos-consumer-grpc-'));
  process.env.NODE_ENV = 'test';
  process.env.GENOS_ADMIN_PASSWORD ||= 'consumer-grpc-test-only';
  process.env.GENOS_GRPC_SHARED_SECRET = 'consumer-grpc-test-only';
  process.env.GENOS_STUDIO_ROOT = path.join(root, 'studio');
  const server = new grpc.Server();
  let client;
  try {
    const db = await getDatabase(path.join(root, 'grpc.db'));
    await db.run("INSERT INTO workflows (id, name, organization_id, project_id) VALUES ('consumer-workflow', 'Consumer', 'consumer-org', 'consumer-project')");
    await db.run("INSERT INTO workflow_runs (id, workflow_id, workflow_version, organization_id, project_id, status, output_json) VALUES ('consumer-run', 'consumer-workflow', 1, 'consumer-org', 'consumer-project', 'failed', '{\"observed\":true}')");
    const Workflow = loadProtos().workflow.genos.workflow.WorkflowService;
    server.addService(Workflow.service, guardService(handler));
    const port = await new Promise((resolve, reject) => server.bindAsync('127.0.0.1:0',
      grpc.ServerCredentials.createInsecure(), (error, value) => error ? reject(error) : resolve(value)));
    client = new Workflow(`127.0.0.1:${port}`, grpc.credentials.createInsecure());
    const request = { workflow_id: 'consumer-run', organization_id: 'consumer-org', project_id: 'consumer-project' };
    const failed = await status(client, request);
    assert.equal(failed.status, 'failed');
    assert.equal(failed.success, false);
    assert.equal(failed.error_code, 'WORKFLOW_FAILED');
    assert.deepEqual(JSON.parse(failed.output_json), { observed: true });
    await db.run("UPDATE workflow_runs SET status = 'completed' WHERE id = 'consumer-run'");
    assert.equal((await status(client, request)).success, true);
    await db.run("UPDATE workflow_runs SET status = 'running' WHERE id = 'consumer-run'");
    assert.equal((await status(client, request)).success, false);
    await assert.rejects(status(client, { ...request, project_id: 'other-project' }), error => error.code === grpc.status.NOT_FOUND);
    await assert.rejects(status(client, { workflow_id: 'consumer-run' }), error => error.code === grpc.status.NOT_FOUND);
    await assert.rejects(status(client, { ...request, project_id: '' }), error => error.code === grpc.status.INVALID_ARGUMENT);
    await assert.rejects(status(client, request, false), error => error.code === grpc.status.UNAUTHENTICATED);
    console.log('Workflow gRPC consumer: real SQLite state, serialized success/error, tenant scope and authenticated transport: PASS');
  } finally {
    client?.close();
    server.forceShutdown();
    await closeDatabase();
    fs.rmSync(root, { recursive: true, force: true });
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
