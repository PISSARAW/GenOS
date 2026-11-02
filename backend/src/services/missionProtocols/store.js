'use strict';

const { digest } = require('../evidenceProtocol/canonical');
const { withTransaction } = require('../../db');

async function initialize(db) {
  await db.exec(`CREATE TABLE IF NOT EXISTS mission_protocol_runs (
    run_id TEXT PRIMARY KEY, agent_id TEXT NOT NULL, mission_id TEXT NOT NULL,
    binding_json TEXT NOT NULL, binding_digest TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS mission_protocol_receipts (
    run_id TEXT NOT NULL, protocol TEXT NOT NULL, point TEXT NOT NULL,
    receipt_json TEXT NOT NULL, receipt_digest TEXT NOT NULL,
    PRIMARY KEY(run_id,protocol,point));`);
}

async function save(binding) {
  const { db, ...value } = binding;
  await withTransaction(db, async () => {
    await initialize(db);
    const prior = await read(db, binding.runId);
    if (prior && prior.binding_digest !== digest(value)) throw new Error('Mission protocol binding is immutable.');
    await db.run(`INSERT OR IGNORE INTO mission_protocol_runs
      (run_id,agent_id,mission_id,binding_json,binding_digest) VALUES(?,?,?,?,?)`,
    binding.runId, binding.agentId, binding.missionId, JSON.stringify(value), digest(value));
  });
}

async function read(db, runId) {
  const table = await db.get("SELECT name FROM sqlite_master WHERE name='mission_protocol_runs'");
  if (!table) return null;
  const row = await db.get('SELECT * FROM mission_protocol_runs WHERE run_id=?', runId);
  if (row && digest(JSON.parse(row.binding_json)) !== row.binding_digest) throw new Error('Mission protocol binding integrity mismatch.');
  return row;
}

async function record(binding, entry) {
  const receipt = { protocol: entry.protocol, point: entry.point, result: entry.result };
  await withTransaction(binding.db, async () => {
    await initialize(binding.db);
    const prior = await binding.db.get(`SELECT receipt_digest FROM mission_protocol_receipts
      WHERE run_id=? AND protocol=? AND point=?`, binding.runId, entry.protocol, entry.point);
    if (prior && prior.receipt_digest !== digest(receipt)) throw new Error('Mission protocol receipt conflict.');
    await binding.db.run(`INSERT OR IGNORE INTO mission_protocol_receipts VALUES(?,?,?,?,?)`,
      binding.runId, entry.protocol, entry.point, JSON.stringify(receipt), digest(receipt));
  });
  return receipt;
}

module.exports = { initialize, save, read, record };
