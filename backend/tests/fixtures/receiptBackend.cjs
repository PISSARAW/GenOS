'use strict';
const { createApp } = require('../../src/app');
const { getDatabase, closeDatabase } = require('../../src/db');

async function main() {
  const db = await getDatabase();
  const mission = process.env.TEST_MISSION_ID;
  await db.run("INSERT OR IGNORE INTO organizations (id,name) VALUES ('receipt-org','Receipt Org')");
  await db.run("INSERT OR IGNORE INTO projects (id,organization_id,name) VALUES ('receipt-project','receipt-org','Receipt Project')");
  await db.run("INSERT OR IGNORE INTO workspaces (id,name,path,organization_id,project_id) VALUES ('receipt-ws','Receipt',?,'receipt-org','receipt-project')", process.env.TEST_WORKSPACE);
  await db.run("INSERT OR IGNORE INTO agents (id,name,role,status,execution_mode,workspace_id) VALUES ('receipt-agent','Receipt','orchestrator','running','orchestrator','receipt-ws')");
  await db.run('INSERT OR IGNORE INTO missions (mission_id,objective) VALUES (?,?)', mission,'receipt process E2E');
  await db.run("INSERT OR IGNORE INTO mission_agents (mission_id,agent_id,role) VALUES (?,'receipt-agent','orchestrator')", mission);
  const server = createApp().listen(Number(process.env.TEST_PORT || 0), '127.0.0.1', () => process.send({ port: server.address().port }));
  process.on('message', async message => {
    if (message === 'inspect') {
      const receipts = await db.all('SELECT receipt_id,receipt_json FROM biological_execution_receipts');
      const cells = await db.all('SELECT * FROM rust_cell_registry');
      process.send({ receipts, cells });
    }
    if (message === 'stop') server.close(async () => { await closeDatabase(); process.exit(0); });
  });
}
main().catch(error => { process.send({ error: error.message }); process.exit(1); });
