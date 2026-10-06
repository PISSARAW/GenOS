'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const sqlite3 = require('sqlite3').verbose();
const { promisify } = require('node:util');

async function main() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'genos-rust-backend-e2e-'));
  const rustRoot = path.join(root, 'rust-state');
  const databaseFile = path.join(root, 'backend.sqlite');
  const missionId = 'mission-rust-backend-e2e';
  const rustBinary = process.env.GENOS_BIOLOGICAL_TEST_BIN || path.resolve(__dirname, '../../target/debug', process.platform === 'win32' ? 'genos.exe' : 'genos');
  const previousRoot = process.env.GENOS_STUDIO_ROOT;
  const previousBinary = process.env.GENOS_BIN;
  process.env.GENOS_STUDIO_ROOT = rustRoot;
  process.env.GENOS_BIN = rustBinary;
  const raw = new sqlite3.Database(databaseFile);
  const db = databaseAdapter(raw);
  try {
    await db.exec(`CREATE TABLE missions (mission_id TEXT PRIMARY KEY, objective TEXT, status TEXT);
      CREATE TABLE agents (id TEXT PRIMARY KEY, organization_id TEXT, project_id TEXT);
      CREATE TABLE mission_agents (mission_id TEXT, agent_id TEXT);
      CREATE TABLE homeostasis_states (id TEXT, mission_id TEXT, status TEXT, observed_at TEXT);
      INSERT INTO missions VALUES ('${missionId}', 'Rust backend continuity test', 'active');
      INSERT INTO agents VALUES ('scope-agent', 'org-e2e', 'project-e2e');
      INSERT INTO mission_agents VALUES ('${missionId}', 'scope-agent');`);
    await require('../src/db/migrations/migrateBiologicalExecutionReceipts').migrateBiologicalExecutionReceipts(db);
    const receiptService = require('../src/services/biologicalExecutionReceiptService');
    const first = await receiptService.runMissionTick(db, {
      missionId, mission: 'E2E measured biological work', organizationId: 'org-e2e', projectId: 'project-e2e', timeoutMs: 60_000, divide: true
    });
    assert.ok(first.receipts.length > 0, 'the compiled Rust CLI must emit execution receipts');
    const firstRows = await db.all(`SELECT mission_id, tick, cell_id, genome_id, cost, payload_hash
      FROM biological_execution_receipts WHERE mission_id = ? ORDER BY tick`, [missionId]);
    assert.ok(firstRows.length > 0);
    assert.ok(firstRows.every((row) => row.mission_id === missionId && row.cell_id && row.genome_id && row.cost > 0));
    const divisionRows = await db.all(`SELECT receipt_schema, operation, cell_id, genome_id, receipt_json
      FROM biological_execution_receipts WHERE mission_id = ? AND receipt_schema = 'genos.cell-division-receipt/v1'`, [missionId]);
    assert.equal(divisionRows.length, 1, 'requested division lineage receipt must reach backend storage');
    const division = JSON.parse(divisionRows[0].receipt_json);
    assert.equal(divisionRows[0].operation, 'cell_division');
    assertCompleteDivisionLineage(division);

    const second = await receiptService.runMissionTick(db, {
      missionId, mission: 'E2E measured biological work', organizationId: 'org-e2e', projectId: 'project-e2e', timeoutMs: 60_000
    });
    assert.equal(second.rustMissionId, first.rustMissionId, 'Rust identity must be durable for a backend mission');
    assert.ok(second.tick > first.tick, 'checkpoint recovery must advance the receipt tick');
    const populationHead = await db.get('SELECT tick FROM rust_population_heads WHERE mission_id = ?', [missionId]);
    assert.equal(populationHead.tick, second.tick);
    const daughter = await db.get('SELECT genome_id FROM rust_cell_registry WHERE mission_id = ? AND cell_id = ?', [missionId, division.daughter_cell_id]);
    assert.equal(daughter?.genome_id, division.daughter_genome_id, 'checkpoint recovery must preserve the division daughter');
    const secondRows = await db.all(`SELECT tick, cell_id, genome_id, payload_hash
      FROM biological_execution_receipts WHERE mission_id = ?
      AND receipt_schema = 'genos.biological-execution-receipt/v1' ORDER BY tick`, [missionId]);
    assert.ok(secondRows.some((row) => row.tick === first.tick));
    assert.ok(secondRows.some((row) => row.tick === second.tick));
    assert.ok(new Set(secondRows.map((row) => row.tick)).size > 1, 'ticks must advance across distinct CLI processes');
    assert.equal(new Set(secondRows.map((row) => row.cell_id)).size, 1, 'cell identity must resume across CLI processes');
    assert.equal(new Set(secondRows.map((row) => row.genome_id)).size, 1, 'genome identity must resume across CLI processes');
    assert.ok(secondRows.every((row) => row.payload_hash));
    console.log(JSON.stringify({ missionId, rustMissionId: first.rustMissionId, persistedReceipts: secondRows.length, resumedCellId: secondRows[0].cell_id, resumedGenomeId: secondRows[0].genome_id }));
  } finally {
    await promisify(raw.close.bind(raw))();
    if (previousRoot === undefined) delete process.env.GENOS_STUDIO_ROOT;
    else process.env.GENOS_STUDIO_ROOT = previousRoot;
    if (previousBinary === undefined) delete process.env.GENOS_BIN;
    else process.env.GENOS_BIN = previousBinary;
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function assertCompleteDivisionLineage(division) {
  for (const key of ['parent_cell_id', 'daughter_cell_id', 'parent_genome_id', 'daughter_genome_id', 'lineage_id']) {
    assert.ok(division[key], `division receipt must attribute ${key}`);
  }
}

function databaseAdapter(db) {
  return {
    exec(sql) { return promisify(db.exec.bind(db))(sql); },
    run(sql, ...params) {
      if (params.length === 1 && Array.isArray(params[0])) params = params[0];
      return new Promise((resolve, reject) => db.run(sql, params, function done(error) {
        if (error) return reject(error);
        resolve({ changes: this.changes });
      }));
    },
    get(sql, ...params) { return promisify(db.get.bind(db))(sql, ...params); },
    all(sql, ...params) { return promisify(db.all.bind(db))(sql, ...params); }
  };
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
