'use strict';
const { digest } = require('./biologicalIntegrity');

function populationFromReceipt(receipt) {
  if (!receipt.population_json) return null;
  const snapshot = JSON.parse(receipt.population_json);
  if (snapshot.schema !== 'genos.population-state/v1' || snapshot.mission_id !== (receipt.rust_mission_id || receipt.mission_id)
      || snapshot.tick !== receipt.tick || snapshot.phase !== 'after_tick' || !Array.isArray(snapshot.active_cells)) {
    throw Object.assign(new Error('Invalid population binding'), { code: 'BIOLOGICAL_RECEIPT_POPULATION_INVALID' });
  }
  snapshot.active_cells.forEach(validateCell);
  validateReceiptBinding(snapshot, receipt);
  return snapshot;
}

function validateReceiptBinding(snapshot, receipt) {
  const ids = snapshot.active_cells.map(cell => cell.cell_id);
  if (new Set(ids).size !== ids.length) throw populationError('Duplicate population cell');
  if (!receipt.cell_id) return;
  const cell = snapshot.active_cells.find(item => item.cell_id === receipt.cell_id);
  if (!cell || cell.genome_id !== receipt.genome_id || cell.genome_fingerprint !== receipt.genome_fingerprint) {
    throw populationError('Receipt genome does not match its population');
  }
}

function populationError(message) {
  return Object.assign(new Error(message), { code: 'BIOLOGICAL_RECEIPT_POPULATION_INVALID' });
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
  ); CREATE TABLE IF NOT EXISTS rust_population_heads (
    mission_id TEXT PRIMARY KEY, tick INTEGER NOT NULL, snapshot_hash TEXT NOT NULL,
    snapshot_json TEXT NOT NULL, source_receipt_id TEXT NOT NULL
  )`);
  await persistHead(db, receipt, snapshot);
  for (const cell of snapshot.active_cells) {
    await db.run(`INSERT INTO rust_cell_registry
      (mission_id, cell_id, genome_id, genome_fingerprint, cell_state_json, genome_state_json, source_receipt_id, tick)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(mission_id, cell_id) DO UPDATE SET
        genome_id=excluded.genome_id, genome_fingerprint=excluded.genome_fingerprint,
        cell_state_json=excluded.cell_state_json, genome_state_json=excluded.genome_state_json,
        source_receipt_id=excluded.source_receipt_id, tick=excluded.tick
      WHERE excluded.tick >= rust_cell_registry.tick`, [receipt.mission_id, cell.cell_id, cell.genome_id,
      cell.genome_fingerprint, cell.cell_state_json || JSON.stringify(cell.cell_state), JSON.stringify(cell.genome_state), receipt.receipt_id, snapshot.tick]);
  }
}

async function persistHead(db, receipt, snapshot) {
  const hash = digest(snapshot);
  const previous = await db.get('SELECT tick, snapshot_hash FROM rust_population_heads WHERE mission_id = ?', receipt.mission_id);
  if (previous?.tick === snapshot.tick && previous.snapshot_hash !== hash) {
    throw populationError('Conflicting population at the same tick');
  }
  await db.run(`INSERT INTO rust_population_heads (mission_id, tick, snapshot_hash, snapshot_json, source_receipt_id)
    VALUES (?, ?, ?, ?, ?) ON CONFLICT(mission_id) DO UPDATE SET tick=excluded.tick,
      snapshot_hash=excluded.snapshot_hash, snapshot_json=excluded.snapshot_json, source_receipt_id=excluded.source_receipt_id
    WHERE excluded.tick > rust_population_heads.tick`, receipt.mission_id, snapshot.tick,
  hash, JSON.stringify(snapshot), receipt.receipt_id);
}
module.exports = { populationFromReceipt, persistPopulation };
