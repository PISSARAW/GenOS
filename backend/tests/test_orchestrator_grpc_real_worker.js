'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const root = path.join(os.tmpdir(), `genos-grpc-real-${process.pid}`);
const secret = `grpc-${crypto.randomBytes(24).toString('hex')}`;
process.env.GENOS_DISABLE_DOTENV = '1';
process.env.GENOS_DB_BACKUP_SKIP = '1';
process.env.GENOS_DB_PATH = path.join(root, 'dispatch.db');
process.env.GENOS_CAPSULE_ROOT = path.join(root, 'capsules');
process.env.GENOS_STUDIO_ROOT = path.join(root, 'studio');
process.env.GENOS_WORKSPACES_ROOT = root;
process.env.GENOS_DISABLE_WORKSPACE_GC = '1';
process.env.GENOS_EPISTEMIC_RECEIPT_SECRET = 'grpc-real-worker-receipt-secret';
process.env.GENOS_GVX_LEDGER_HMAC_SECRET = 'grpc-real-worker-ledger-secret';
process.env.GENOS_GRPC_SHARED_SECRET = secret;
process.env.NODE_ENV = 'test';

const grpc = require('@grpc/grpc-js');
const loadAllProtos = require('../proto');
const service = require('../src/grpc_services/orchestratorService');
const { guardService } = require('../src/grpc_services/grpcAuth');
const { getDatabase, closeDatabase } = require('../src/db');
const telemetry = require('../src/services/telemetryObserver');
const kinds = require('../src/services/agents/workerKindService');
const { scoped } = require('./helpers/nativeWorkerFixtures');

function metadata(token) {
  const value = new grpc.Metadata();
  if (token) value.set('x-genos-grpc-key', token);
  return value;
}

function dispatch(client, request, token) {
  return new Promise((resolve, reject) => {
    client.DispatchWorker(request, metadata(token), (error, response) => {
      if (error) reject(error);
      else resolve(response);
    });
  });
}

async function startServer() {
  const server = new grpc.Server();
  const descriptors = loadAllProtos();
  const definition = descriptors.orchestrator.genos.orchestrator.v1.OrchestratorService;
  server.addService(definition.service, guardService(service));
  const port = await new Promise((resolve, reject) => {
    server.bindAsync('127.0.0.1:0', grpc.ServerCredentials.createInsecure(), (error, assigned) => {
      if (error) reject(error);
      else resolve(assigned);
    });
  });
  return { server, client: new definition(`127.0.0.1:${port}`, grpc.credentials.createInsecure()) };
}

async function seed(db, workspace) {
  await db.run("INSERT INTO organizations (id,name) VALUES ('grpc-real-org','gRPC real worker')");
  await db.run("INSERT INTO projects (id,organization_id,name) VALUES ('grpc-real-project','grpc-real-org','gRPC real worker')");
  await db.run(`INSERT INTO workspaces (id,name,path,visibility,organization_id,project_id)
    VALUES ('grpc-real-ws','gRPC real worker',?,'Private','grpc-real-org','grpc-real-project')`, workspace);
  await db.run(`INSERT INTO agents (id,name,role,status,execution_mode,workspace_id,cognitive_budget)
    VALUES ('grpc-real-orchestrator','Orchestrator','orchestrator','running','orchestrator','grpc-real-ws',1000000)`);
  const workerContract = kinds.buildWorkerContract('bounded_worker', {
    parentAgentId: 'grpc-real-orchestrator', prompt: 'Compute subset sum',
    methodContract: scoped, workspaceRoot: workspace
  });
  await db.run(`INSERT INTO agents
    (id,name,role,status,execution_mode,parent_agent_id,workspace_id,isolation_mode,cognitive_budget,metadata_json)
    VALUES ('grpc-real-worker','Worker','bounded_worker','idle','worker','grpc-real-orchestrator',
      'grpc-real-ws','Branch',100000,?)`, JSON.stringify({ workerKind: 'bounded_worker', workerContract }));
  await db.run(`INSERT INTO missions (mission_id,objective,orchestrator_agent_id)
    VALUES ('grpc-real-mission','Compute subset sum','grpc-real-orchestrator')`);
  await db.run(`INSERT INTO mission_agents (mission_id,agent_id,role) VALUES
    ('grpc-real-mission','grpc-real-orchestrator','orchestrator'),
    ('grpc-real-mission','grpc-real-worker','worker')`);
  await require('../src/services/strategyContractService').saveContract(db, {
    agentId: 'grpc-real-orchestrator', workspaceId: 'grpc-real-ws',
    problem: 'Compute a bounded subset sum with durable evidence'
  });
}

async function verifyResult(db, observed) {
  const run = await db.get(`SELECT id,status FROM strategy_execution_runs
    WHERE agent_id='grpc-real-worker' ORDER BY rowid DESC LIMIT 1`);
  assert.equal(run.status, 'completed');
  const receipt = await require('../src/services/biologicalWorkerStore').receipt(db, run.id);
  assert.equal(receipt.schema, 'genos.worker-biological-execution-receipt/v1');
  assert.equal(receipt.workerId, 'grpc-real-worker');
  assert.equal(receipt.runId, run.id);
  assert.equal(receipt.result.status, 'completed');
  assert.ok(observed.some((event) => event.agentId === 'grpc-real-worker'
    && event.eventType === 'AGENT_COMPLETED' && event.payload.executionRunId === run.id));
  const bound = await db.get(`SELECT w.path,w.tags,a.metadata_json FROM agents a JOIN workspaces w ON w.id=a.workspace_id
    WHERE a.id='grpc-real-worker'`);
  assert.notEqual(path.resolve(bound.path), path.resolve(await workspacePath()));
  assert.ok(JSON.parse(bound.tags).includes('worker_capsule'));
  assert.equal(JSON.parse(bound.metadata_json).workerContract.mission.scope, bound.path);
  return { runId: run.id, receiptId: receipt.receiptId };
}

async function workspacePath() {
  return path.join(root, 'workspace');
}

async function main() {
  await fs.rm(root, { recursive: true, force: true });
  const workspace = await workspacePath();
  await fs.mkdir(workspace, { recursive: true });
  await fs.writeFile(path.join(workspace, 'task.txt'), 'native gRPC worker input');
  const db = await getDatabase(process.env.GENOS_DB_PATH);
  const observed = [];
  const observer = event => observed.push(event);
  telemetry.on('telemetry', observer);
  const { server, client } = await startServer();
  try {
    await seed(db, workspace);
    const request = { orchestrator_id: 'grpc-real-orchestrator', worker_id: 'grpc-real-worker',
      prompt: 'Compute the persisted scoped subset sum', organization_id: 'grpc-real-org',
      project_id: 'grpc-real-project', workspace_id: 'grpc-real-ws', timeout_ms: 60000 };
    await assert.rejects(dispatch(client, request), error => error.code === grpc.status.UNAUTHENTICATED);
    await assert.rejects(dispatch(client, request, 'wrong-secret'), error => error.code === grpc.status.PERMISSION_DENIED);
    const response = await dispatch(client, request, secret);
    if (!response.success) {
      const agent = await db.get("SELECT status,current_task FROM agents WHERE id='grpc-real-worker'");
      const run = await db.get("SELECT status,guardrail_reason,metrics_json FROM strategy_execution_runs WHERE agent_id='grpc-real-worker' ORDER BY rowid DESC LIMIT 1");
      throw new Error(`${response.status}: ${JSON.stringify({ agent, run, observed })}`);
    }
    const proof = await verifyResult(db, observed);
    console.log(JSON.stringify({ authenticated: true, runtime: 'deterministicWorkerRuntime',
      terminalEvent: 'AGENT_COMPLETED', externalLlm: false, websocketUsed: false, ...proof }));
  } finally {
    telemetry.removeListener('telemetry', observer);
    client.close();
    await new Promise(resolve => server.tryShutdown(resolve));
    await require('../src/services/garageRuntimeService').stop(db);
    await require('./helpers/flushTelemetrySideEffects').flushTelemetrySideEffects();
    await closeDatabase();
    await fs.rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
