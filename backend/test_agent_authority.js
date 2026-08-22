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
      name: 'Bound Worker',
      prompt: 'Implement the assigned branch only'
    });
    assert.equal(deployed.status, 201);
    assert.equal(deployed.body.agent.executionMode, 'worker');
    assert.equal(deployed.body.dispatchRequired, true);
    assert.equal(deployed.body.strategyContract.contract.strategy_decisions.length, 77);
    const workerId = deployed.body.agentId;

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
