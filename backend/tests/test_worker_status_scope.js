const assert = require('assert');
const fs = require('fs');
const path = require('path');
const organization = require('../src/services/dynamicOrganizationService');
const contract = require('../src/services/mcpContract');
const validation = require('../src/services/mcpArgumentValidation');
const { getDatabase, closeDatabase } = require('../src/db');

async function seedStatusAgents(db) {
  await db.run("INSERT INTO agents(id,name,role,status,execution_mode) VALUES ('status-root','Root','orchestrator','running','orchestrator')");
  await db.run("INSERT INTO agents(id,name,role,status,execution_mode,parent_agent_id) VALUES ('status-worker-a','A','implementation','running','worker','status-root')");
  await db.run("INSERT INTO agents(id,name,role,status,execution_mode,parent_agent_id) VALUES ('status-worker-b','B','reviewer','completed','worker','status-root')");
  await db.run("INSERT INTO agents(id,name,role,status,execution_mode) VALUES ('status-other-root','Other','orchestrator','running','orchestrator')");
  await db.run("INSERT INTO agents(id,name,role,status,execution_mode,parent_agent_id) VALUES ('status-foreign-worker','Foreign','worker','running','worker','status-other-root')");
}

async function verifyScopedStatus(db) {
  const fullRoster = await organization.getWorkerStatusForMember(db, {
    orchestratorId: 'status-root', requesterAgentId: 'status-worker-a', limit: 100
  });
  assert.equal(fullRoster.workers.length, 2, 'limit is capped and only direct workers are listed');
  assert.equal(fullRoster.workers.find((worker) => worker.workerId === 'status-worker-b').status, 'completed');
  const exactWorker = await organization.getWorkerStatusForMember(db, {
    orchestratorId: 'status-root', requesterAgentId: 'status-root', workerId: 'status-worker-a'
  });
  assert.deepEqual(exactWorker.workers.map((worker) => worker.workerId), ['status-worker-a']);
  const foreignWorker = await organization.getWorkerStatusForMember(db, {
    orchestratorId: 'status-root', requesterAgentId: 'status-root', workerId: 'status-foreign-worker'
  });
  assert.deepEqual(foreignWorker.workers, [], 'foreign workers are not revealed by ID lookup');
  await assert.rejects(() => organization.getWorkerStatusForMember(db, {
    orchestratorId: 'status-other-root', requesterAgentId: 'status-worker-a'
  }), (error) => error.code === 'ORGANIZATION_ACCESS_DENIED');
}

async function run() {
  process.env.GENOS_ADMIN_PASSWORD ||= 'worker-status-test-password';
  const dbPath = path.resolve(__dirname, `worker-status-scope-${process.pid}.db`);
  if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
  const db = await getDatabase(dbPath);
  try {
    await seedStatusAgents(db);
    await verifyScopedStatus(db);
    const schema = contract.getFullToolSchema('genos_worker_status');
    assert.equal(schema.properties.limit.maximum, 50);
    assert.equal(validation.validateToolArguments('genos_worker_status', { limit: 1 }), null);
    assert.match(validation.validateToolArguments('genos_worker_status', { limit: 51 }).message, /must be <= 50/);
  } finally {
    await closeDatabase();
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
  }
  console.log('Worker status MCP scope checks passed.');
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
