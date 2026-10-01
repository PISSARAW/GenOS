'use strict';

function populationFromReceipt(receipt) {
  if (!receipt.population_json) return null;
  const snapshot = JSON.parse(receipt.population_json);
  if (snapshot.schema !== 'genos.population-state/v1' || snapshot.mission_id !== receipt.mission_id
      || snapshot.tick !== receipt.tick || snapshot.phase !== 'after_tick' || !Array.isArray(snapshot.active_cells)) {
    throw Object.assign(new Error('Invalid population binding'), { code: 'BIOLOGICAL_RECEIPT_POPULATION_INVALID' });
  }
  snapshot.active_cells.forEach(validateCell);
  return snapshot;
}

function validateCell(cell) {
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!uuid.test(cell.cell_id) || cell.cell_state?.cell_id !== cell.cell_id
      || cell.cell_state?.genome_id !== cell.genome_id) {
    throw Object.assign(new Error('Invalid cell identity'), { code: 'BIOLOGICAL_RECEIPT_POPULATION_INVALID' });
  }
}

async function persistPopulation(db, receipt) {
  const snapshot = populationFromReceipt(receipt);
  if (!snapshot) return;
  await db.exec(`CREATE TABLE IF NOT EXISTS rust_cell_registry (
    mission_id TEXT NOT NULL, cell_id TEXT NOT NULL, genome_id TEXT,
    genome_fingerprint TEXT, cell_state_json TEXT NOT NULL, genome_state_json TEXT,
    source_receipt_id TEXT NOT NULL, tick INTEGER NOT NULL,
    PRIMARY KEY (mission_id, cell_id)
  )`);
  for (const cell of snapshot.active_cells) {
    await db.run(`INSERT INTO rust_cell_registry
      (mission_id, cell_id, genome_id, genome_fingerprint, cell_state_json, genome_state_json, source_receipt_id, tick)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(mission_id, cell_id) DO UPDATE SET
        genome_id=excluded.genome_id, genome_fingerprint=excluded.genome_fingerprint,
        cell_state_json=excluded.cell_state_json, genome_state_json=excluded.genome_state_json,
        source_receipt_id=excluded.source_receipt_id, tick=excluded.tick
      WHERE excluded.tick >= rust_cell_registry.tick`, [receipt.mission_id, cell.cell_id, cell.genome_id,
      cell.genome_fingerprint, JSON.stringify(cell.cell_state), JSON.stringify(cell.genome_state), receipt.receipt_id, snapshot.tick]);
  }
}
module.exports = { populationFromReceipt, persistPopulation };
