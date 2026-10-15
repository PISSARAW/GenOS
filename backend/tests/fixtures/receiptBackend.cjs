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
    if (message?.action === 'seed-clinical-cell') {
      const row = message.row;
      try {
        await db.exec(`CREATE TABLE IF NOT EXISTS rust_cell_registry (
          mission_id TEXT NOT NULL, cell_id TEXT NOT NULL, genome_id TEXT,
          genome_fingerprint TEXT, cell_state_json TEXT NOT NULL, genome_state_json TEXT,
          source_receipt_id TEXT NOT NULL, tick INTEGER NOT NULL,
          PRIMARY KEY (mission_id, cell_id)
        )`);
        await db.run(`INSERT INTO rust_cell_registry
          (mission_id, cell_id, genome_id, genome_fingerprint, cell_state_json,
           genome_state_json, source_receipt_id, tick)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, row.missionId, row.cellId, row.genomeId,
        row.genomeFingerprint, row.cellStateJson, row.genomeStateJson,
        row.sourceReceiptId, row.tick);
        process.send({ seeded: true });
      } catch (error) {
        process.send({ error: error.message });
      }
    }
  });
}
main().catch(error => { process.send({ error: error.message }); process.exit(1); });
