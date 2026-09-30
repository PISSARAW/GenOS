'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const sqlite3 = require('sqlite3').verbose();
const { migrateMedicalTables } = require('../src/db/migrations/migrateMedicalTables');
const clinical = require('../src/services/medical/clinicalStateService');

function databaseAdapter(database) {
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

function openDatabase(file) {
  const database = new sqlite3.Database(file);
  return { database, adapter: databaseAdapter(database) };
}

async function closeDatabase(database) {
  await new Promise((resolve, reject) => database.close((error) => error ? reject(error) : resolve()));
}

async function main() {
  const file = path.join(os.tmpdir(), `genos-clinical-${process.pid}-${Date.now()}.sqlite`);
  let first = openDatabase(file);
  await first.adapter.exec('CREATE TABLE agents (id TEXT PRIMARY KEY)');
  await first.adapter.run('INSERT INTO agents (id) VALUES (?)', 'clinical-agent');
  await migrateMedicalTables(first.adapter);
  const initial = await clinical.initClinicalState(first.adapter, 'clinical-agent');
  assert.equal((await clinical.initClinicalState(first.adapter, 'clinical-agent')).id, initial.id,
    'clinical state initialization is safe to repeat');
  const updated = await clinical.refreshClinicalState(first.adapter, 'clinical-agent', {
    cognitiveIntegrity: 0.7, stress: 0.4, energy: 0.6, budgetRatio: 0.8,
    immuneTiter: 0.65, inflammatoryIndex: 0.3, plasmidLoad: 0.2,
    pathogenBurden: 0.45, cellCycleState: 'S', iatrogenicDelta: 0.12,
  });
  await closeDatabase(first.database);

  first = openDatabase(file);
  const restored = await clinical.getClinicalState(first.adapter, 'clinical-agent');
  assert.equal(restored.id, initial.id);
  assert.deepEqual(restored.vitals, updated.vitals);
  for (const field of ['immuneTiter', 'inflammatoryIndex', 'cellCycleState', 'plasmidLoad', 'pathogenBurden', 'iatrogenicLoad', 'wellnessScore']) {
    assert.equal(restored[field], updated[field], `${field} survives database reopen`);
  }
  await closeDatabase(first.database);
  await fs.rm(file, { force: true });
  console.log('Clinical state survives SQLite close and reopen: PASS');
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
