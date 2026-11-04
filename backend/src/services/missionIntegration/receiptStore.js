'use strict';
const { digest, fail } = require('./contract');
const integrity = require('../qualityElevation/qualityReceiptIntegrity');

async function ensure(db) {
  await db.exec(`CREATE TABLE IF NOT EXISTS mission_mechanisms_receipts (
    receipt_id TEXT PRIMARY KEY,mission_id TEXT NOT NULL,owner_id TEXT NOT NULL,
    body_json TEXT NOT NULL,body_digest TEXT NOT NULL,UNIQUE(mission_id,owner_id));
    CREATE TRIGGER IF NOT EXISTS mission_mechanisms_immutable_update BEFORE UPDATE ON mission_mechanisms_receipts
      BEGIN SELECT RAISE(ABORT,'mission mechanism evidence is immutable'); END;
    CREATE TRIGGER IF NOT EXISTS mission_mechanisms_immutable_delete BEFORE DELETE ON mission_mechanisms_receipts
      BEGIN SELECT RAISE(ABORT,'mission mechanism evidence is immutable'); END;`);
}
function authenticated(record) {
  return record?.schema === 'genos.mission-mechanisms-receipt/v1' && integrity.authenticated(record);
}
async function put(db, body) {
  await ensure(db);
  const record = integrity.sign(body), encoded = JSON.stringify(record);
  await db.run(`INSERT OR IGNORE INTO mission_mechanisms_receipts VALUES(?,?,?,?,?)`,
    record.receiptId, record.missionId, record.orchestratorId, encoded, digest(record));
  const saved = await get(db, { receiptId: record.receiptId, missionId: record.missionId, orchestratorId: record.orchestratorId });
  if (digest(saved) !== digest(record)) throw fail('MISSION_MECHANISMS_RECEIPT_CONFLICT');
  return saved;
}
async function existing(db, input) {
  await ensure(db);
  const row = await db.get('SELECT receipt_id FROM mission_mechanisms_receipts WHERE mission_id=? AND owner_id=?',
    input.missionId, input.orchestratorId);
  return row ? get(db, { ...input, receiptId: row.receipt_id }) : null;
}
async function get(db, input) {
  await ensure(db);
  const row = await db.get('SELECT * FROM mission_mechanisms_receipts WHERE receipt_id=? AND mission_id=? AND owner_id=?',
    input.receiptId, input.missionId, input.orchestratorId);
  if (!row) throw fail('MISSION_MECHANISMS_RECEIPT_MISSING');
  const record = JSON.parse(row.body_json);
  if (!authenticated(record) || digest(record) !== row.body_digest || record.receiptId !== row.receipt_id
    || record.missionId !== row.mission_id || record.orchestratorId !== row.owner_id) {
    throw fail('MISSION_MECHANISMS_RECEIPT_INVALID');
  }
  return record;
}
module.exports = { put, get, existing, authenticated };
