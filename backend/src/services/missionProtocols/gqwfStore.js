'use strict';

const { digest } = require('../evidenceProtocol/canonical');
const { withTransaction } = require('../../db');

async function initialize(db) {
  await db.exec(`CREATE TABLE IF NOT EXISTS mission_protocol_gqwf (
    run_id TEXT PRIMARY KEY,body TEXT NOT NULL,fingerprint TEXT NOT NULL
  ); CREATE TABLE IF NOT EXISTS mission_protocol_gqwf_proofs (
    subject TEXT PRIMARY KEY,body TEXT NOT NULL,fingerprint TEXT NOT NULL
  );`);
}

async function read(db, runId) {
  const row = await db.get('SELECT * FROM mission_protocol_gqwf WHERE run_id=?', runId);
  if (!row) return null;
  const state = JSON.parse(row.body);
  if (row.fingerprint !== digest(state)) throw new Error('MISSION_GQWF_STATE_INTEGRITY');
  return state;
}

async function save(db, input) {
  return withTransaction(db, async () => {
    const prior = await read(db, input.state.runId);
    if (digest(prior) !== digest(input.expected)) throw new Error('MISSION_GQWF_STATE_CHANGED');
    await db.run('INSERT OR REPLACE INTO mission_protocol_gqwf VALUES(?,?,?)', input.state.runId,
      JSON.stringify(input.state), digest(input.state));
    return input.state;
  });
}

async function proof(db, subject) {
  const row = await db.get('SELECT * FROM mission_protocol_gqwf_proofs WHERE subject=?', subject);
  if (!row) return null;
  const value = JSON.parse(row.body);
  if (digest(value) !== row.fingerprint) throw new Error('MISSION_GQWF_PROOF_INTEGRITY');
  return value;
}

async function saveProof(db, input) {
  await db.run('INSERT OR IGNORE INTO mission_protocol_gqwf_proofs VALUES(?,?,?)', input.subject,
    JSON.stringify(input.proof), digest(input.proof));
  return proof(db, input.subject);
}

module.exports = { initialize, read, save, proof, saveProof };
