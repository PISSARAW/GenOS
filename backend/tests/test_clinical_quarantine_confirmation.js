'use strict';

const assert = require('node:assert/strict');
const sqlite3 = require('sqlite3').verbose();
const { migrateMedicalTables } = require('../src/db/migrations/migrateMedicalTables');
const clinical = require('../src/services/medical/clinicalStateService');
const gate = require('../src/services/medical/missionQuarantineGate');

function adapter(database) {
  const invoke = (mode, sql, params) => new Promise((resolve, reject) => {
    database[mode](sql, params, function callback(error, value) {
      if (error) return reject(error);
      resolve(mode === 'run' ? this : value);
    });
  });
  return {
    exec: (sql) => new Promise((resolve, reject) => database.exec(sql, (error) => error ? reject(error) : resolve())),
    run: (sql, ...params) => invoke('run', sql, params),
    get: (sql, ...params) => invoke('get', sql, params),
    all: (sql, ...params) => invoke('all', sql, params),
  };
}

async function main() {
  const database = new sqlite3.Database(':memory:');
  const db = adapter(database);
  await db.exec('CREATE TABLE agents (id TEXT PRIMARY KEY, status TEXT, updated_at TEXT)');
  await db.run('INSERT INTO agents (id, status) VALUES (?, ?)', 'suspect', 'idle');
  await migrateMedicalTables(db);
  await clinical.initClinicalState(db, 'suspect');
  await clinical.refreshClinicalState(db, 'suspect', {
    cognitiveIntegrity: 0.1, stress: 1, budgetRatio: 0, immuneTiter: 0,
    inflammatoryIndex: 1, plasmidLoad: 1, pathogenBurden: 1, iatrogenicDelta: 1,
  });
  await assert.rejects(gate.assertMissionDispatchAllowed(db, 'suspect'), { code: 'AGENT_QUARANTINED' });
  const rows = await db.all('SELECT status FROM pathologies WHERE agent_id = ?', 'suspect');
  assert.ok(rows.some((row) => row.status === 'confirmed'), 'quarantine must follow a confirmed biopsy');
  const agent = await db.get('SELECT status FROM agents WHERE id = ?', 'suspect');
  assert.equal(agent.status, 'blocked');
  await new Promise((resolve, reject) => database.close((error) => error ? reject(error) : resolve()));
  console.log('Mission quarantine requires a confirmed high-risk diagnosis: PASS');
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
