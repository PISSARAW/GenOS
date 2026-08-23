const assert = require('assert');
const fs = require('fs');
const http = require('http');
const path = require('path');
const { createApp } = require('./src/app');
const { getDatabase, closeDatabase } = require('./src/db');
const { TEST_ADMIN_TOKEN } = require('./testAuth');
const authority = require('./src/services/agentAuthorityService');
const contracts = require('./src/services/strategyContractService');
const { encodeMission, decodeMission } = require('./src/services/runtimeProtocol');

const PORT = 4107;

function request(method, route, body) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: '127.0.0.1', port: PORT, method, path: route,
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': 'agent-authority-test',
        Authorization: `Bearer ${TEST_ADMIN_TOKEN}`
      }
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(data || '{}') }));
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function run() {
  const dbPath = path.resolve(__dirname, 'agent-authority-test.db');
  if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
  const db = await getDatabase(dbPath);
  const workspace = { id: 'authority-workspace' };
  await db.run(
    `INSERT INTO workspaces (id, name, path, description) VALUES (?, ?, ?, ?)`,
    workspace.id, 'Authority workspace', __dirname, 'Workspace for agent authority tests'
  );
  await db.run(`INSERT INTO agents (id, name, role, status, execution_mode, current_task)
    VALUES ('authority-orchestrator', 'Authority Orchestrator', 'Coordinator', 'idle', 'orchestrator', 'Repair a stateful defect')`);
  await contracts.saveContract(db, {
    agentId: 'authority-orchestrator',
    problem: 'Repair a stateful defect with deterministic tests'
  });

  assert.equal(authority.normalizeExecutionMode(), 'orchestrator');
  assert.equal(authority.normalizeExecutionMode('worker'), 'worker');
  assert.throws(() => authority.normalizeExecutionMode('autonomous'), /executionMode/);
  const mission = decodeMission(encodeMission({
    agentId: 'worker', executionMode: 'worker', orchestratorAgentId: 'authority-orchestrator'
  }));
  assert.equal(mission.executionMode, 'worker');
  assert.equal(mission.orchestratorAgentId, 'authority-orchestrator');

  const server = createApp().listen(PORT);
  try {
    const missingParent = await request('POST', '/api/deploy', { executionMode: 'worker', name: 'Rejected Worker' });
    assert.equal(missingParent.status, 400);
    assert.equal(missingParent.body.error.code, 'WORKER_REQUIRES_ORCHESTRATOR');

    const deployed = await request('POST', '/api/deploy', {
      executionMode: 'worker',
      parentAgentId: 'authority-orchestrator',
      workspaceId: workspace.id,
      name: 'Bound Worker',
      prompt: 'Implement the assigned branch only'
    });
    assert.equal(deployed.status, 201);
    assert.equal(deployed.body.agent.executionMode, 'worker');
    assert.equal(deployed.body.dispatchRequired, true);
    assert.equal(deployed.body.strategyContract.contract.strategy_decisions.length, 77);
    const workerId = deployed.body.agentId;

    const missionNamed = await request('POST', '/api/deploy', {
      executionMode: 'worker', parentAgentId: 'authority-orchestrator', workspaceId: workspace.id,
      role: 'independent_reviewer', prompt: 'Verify token refresh race conditions'
    });
    assert.equal(missionNamed.status, 201);
    assert.equal(missionNamed.body.agent.name, 'Verify · token refresh race conditions');
    const garage = await request('GET', '/api/agents/authority-orchestrator/workers/garage');
    assert.equal(garage.status, 200);
    assert.deepEqual({ capacity: garage.body.capacity, occupied: garage.body.occupied, available: garage.body.available }, { capacity: 3, occupied: 0, available: 3 });

    const selfStart = await request('POST', `/api/agents/${workerId}/start`, {});
    assert.equal(selfStart.status, 409);
    assert.equal(selfStart.body.error.code, 'WORKER_REQUIRES_ORCHESTRATOR');

    const inherited = await request('GET', `/api/agents/${workerId}/strategy-contract`);
    assert.equal(inherited.status, 200);
    assert.equal(inherited.body.inheritedByWorker, true);
    assert.equal(inherited.body.contract.strategy_decisions.length, 77);

    const wrongDispatcher = await request('POST', `/api/agents/not-the-parent/workers/${workerId}/dispatch`, {});
    assert.equal(wrongDispatcher.status, 404);
    assert.equal(wrongDispatcher.body.error.code, 'ORCHESTRATOR_NOT_FOUND');

    // A Studio stop also reconciles stale "running" rows when no child
    // process exists in this backend instance.
    await db.run("UPDATE agents SET status = 'running' WHERE id = 'authority-orchestrator'");
    const stopped = await request('POST', '/api/agents/authority-orchestrator/stop', {});
    assert.equal(stopped.status, 200);
    assert.equal(stopped.body.stopped, false);
    assert.equal(stopped.body.status, 'idle');
    assert.equal((await db.get("SELECT status FROM agents WHERE id = 'authority-orchestrator'"))?.status, 'idle');
    const deleted = await request('DELETE', '/api/agents/authority-orchestrator');
    assert.equal(deleted.status, 200);
    assert.equal(await db.get("SELECT id FROM agents WHERE id = 'authority-orchestrator'"), undefined);
    console.log('Agent authority: all assertions passed.');
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await closeDatabase();
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
