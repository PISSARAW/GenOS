'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
process.env.GENOS_ADMIN_PASSWORD = process.env.GENOS_ADMIN_PASSWORD || 'bio-receipt-ingestion-test';
const dbApi = require('../src/db');
const receipts = require('../src/services/biologicalExecutionReceiptService');

async function main() {
  const priorStudioRoot = process.env.GENOS_STUDIO_ROOT;
  const studioRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'genos-biological-receipts-'));
  process.env.GENOS_STUDIO_ROOT = studioRoot;
  const dbPath = path.join(studioRoot, 'receipt-ingestion.db');
  for (const suffix of ['', '-wal', '-shm']) if (fs.existsSync(dbPath + suffix)) fs.unlinkSync(dbPath + suffix);
  const db = await dbApi.getDatabase(dbPath);
  try {
    await db.run("INSERT INTO missions (mission_id, objective) VALUES ('backend-mission-1', 'persist Rust biology')");
    const input = {
      missionId: 'backend-mission-1', rustMissionId: '5e15c2c7-8212-4ef4-b339-1d127c480000',
      receipts: [
        { schema: 'genos.biological-execution-receipt/v1', receipt_id: 'bio-1', mission_id: '5e15c2c7-8212-4ef4-b339-1d127c480000', operation: 'Observe', cost: 2.5, cost_unit: 'atp_token', consumed: true, completed: true },
        { schema: 'genos.cell-division-receipt/v1', receipt_id: 'division-1', mission_id: '5e15c2c7-8212-4ef4-b339-1d127c480000', parent_cell_id: 'cell-a', daughter_cell_id: 'cell-b', parent_genome_id: 'genome-a', consumed_cost: 3.5, cost_unit: 'atp_token', completed: true },
        { schema: 'genos.population-state/v1', mission_id: '5e15c2c7-8212-4ef4-b339-1d127c480000', tick: 7, active_cells: [], dormant_spores: [] }
      ]
    };
    const first = await receipts.ingest(db, input);
    assert.equal(first.inserted, 3);
    assert.equal(first.expenditure.total, 6);
    const replay = await receipts.ingest(db, input);
    assert.equal(replay.inserted, 0);
    await assert.rejects(() => receipts.ingest(db, { ...input, receipts: [{ ...input.receipts[0], mission_id: 'wrong-rust-mission' }] }), { code: 'BIOLOGICAL_RECEIPT_INVALID' });
    await assert.rejects(() => receipts.ingest(db, { ...input, receipts: [{ ...input.receipts[0], cost: 99 }] }), { code: 'BIOLOGICAL_RECEIPT_CONFLICT' });
    const stored = await db.get('SELECT cell_id, genome_id FROM biological_execution_receipts WHERE receipt_id = ?', 'division-1');
    assert.equal(stored.cell_id, 'cell-a');
    assert.equal(stored.genome_id, 'genome-a');

    await db.run("INSERT INTO missions (mission_id, objective) VALUES ('backend-bridge-mission', 'real rust tick')");
    const runner = async (args) => {
      const rustId = args[args.indexOf('--mission-id') + 1];
      return { ok: true, json: { operation: 'biological_mission_tick', mission_id: rustId, tick: 1, receipts: [
        { schema: 'genos.biological-execution-receipt/v1', receipt_id: 'bridge-tick-1', mission_id: rustId,
          cell_id: 'root-cell', genome_id: 'root-genome', genome_fingerprint: 'sha256:root',
          cost: 1.25, cost_unit: 'atp_token', consumed: true, completed: true },
        { schema: 'genos.population-state/v1', mission_id: rustId, tick: 1, active_cells: [], dormant_spores: [] }
      ] } };
    };
    const firstTick = await receipts.runMissionTick(db, { missionId: 'backend-bridge-mission', mission: 'real rust tick', runGenos: runner });
    const secondTick = await receipts.runMissionTick(db, { missionId: 'backend-bridge-mission', mission: 'real rust tick', runGenos: runner });
    assert.equal(firstTick.rustMissionId, secondTick.rustMissionId, 'backend mission keeps one Rust identity across dispatches');
    assert.equal(firstTick.expenditure.total, 1.25);
    assert.equal(secondTick.inserted, 0, 'replayed receipt batches remain idempotent');
    const bridgeReceipt = await db.get("SELECT mission_id, rust_mission_id, cell_id, genome_id FROM biological_execution_receipts WHERE receipt_id = 'bridge-tick-1'");
    assert.equal(bridgeReceipt.mission_id, 'backend-bridge-mission');
    assert.equal(bridgeReceipt.rust_mission_id, firstTick.rustMissionId);
    assert.equal(bridgeReceipt.cell_id, 'root-cell');
    assert.equal(bridgeReceipt.genome_id, 'root-genome');

    const cli = require('../src/services/genosCli');
    if (fs.existsSync(cli.resolveGenosBin())) {
      await db.run("INSERT INTO missions (mission_id, objective) VALUES ('backend-real-rust-mission', 'real Rust receipt bridge')");
      const actual = await receipts.runMissionTick(db, { missionId: 'backend-real-rust-mission', mission: 'real Rust receipt bridge' });
      assert.ok(actual.inserted >= 2, 'real Rust tick and population receipts reach the backend');
      assert.ok(actual.expenditure.total > 0, 'real ATP cost is aggregated against the backend mission');
      const actualReceipt = await db.get(`SELECT mission_id, rust_mission_id, cell_id, genome_id, genome_fingerprint, cost
        FROM biological_execution_receipts WHERE mission_id = 'backend-real-rust-mission' AND cost > 0 LIMIT 1`);
      assert.equal(actualReceipt.mission_id, 'backend-real-rust-mission');
      assert.equal(actualReceipt.rust_mission_id, actual.rustMissionId);
      assert.ok(actualReceipt.cell_id && actualReceipt.genome_id && actualReceipt.genome_fingerprint);
      assert.ok(actualReceipt.cost > 0);
      const resumed = await receipts.runMissionTick(db, { missionId: 'backend-real-rust-mission', mission: 'real Rust receipt bridge' });
      assert.equal(resumed.rustMissionId, actual.rustMissionId, 'restart path retains the mission-to-Rust identity');
      assert.ok(resumed.inserted >= 2, 'a later tick for the same mission gets a distinct population snapshot receipt');
      assert.ok(resumed.expenditure.total > actual.expenditure.total);
      const snapshots = await db.all(`SELECT payload_json FROM biological_execution_receipts
        WHERE mission_id = 'backend-real-rust-mission' AND schema_id = 'genos.population-state/v1'`);
      assert.equal(snapshots.length, 2, 'each Rust process persists one population snapshot');
      const tickReceipts = await db.all(`SELECT cell_id, genome_id, genome_fingerprint FROM biological_execution_receipts
        WHERE mission_id = 'backend-real-rust-mission' AND schema_id = 'genos.biological-execution-receipt/v1'`);
      assert.ok(tickReceipts.length >= 2);
      assert.equal(new Set(tickReceipts.map(row => row.cell_id)).size, 1, 'restart resumes the same Rust cell identity');
      assert.equal(new Set(tickReceipts.map(row => row.genome_id)).size, 1, 'restart resumes the same genome identity');
      assert.equal(new Set(tickReceipts.map(row => row.genome_fingerprint)).size, 1, 'restart preserves the genome fingerprint');
      const tickNumbers = snapshots.map(row => JSON.parse(row.payload_json).tick);
      assert.equal(new Set(tickNumbers).size, 2, 'restored event history advances the tick sequence across CLI processes');
    }
    console.log('Biological receipt ingestion, mission expenditure and replay idempotency passed.');
  } finally {
    await dbApi.closeDatabase();
    for (const suffix of ['', '-wal', '-shm']) if (fs.existsSync(dbPath + suffix)) fs.unlinkSync(dbPath + suffix);
    if (priorStudioRoot === undefined) delete process.env.GENOS_STUDIO_ROOT;
    else process.env.GENOS_STUDIO_ROOT = priorStudioRoot;
    fs.rmSync(studioRoot, { recursive: true, force: true });
  }
}

main().catch((error) => { console.error(error); process.exit(1); });
