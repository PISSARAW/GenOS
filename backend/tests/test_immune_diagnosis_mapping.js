'use strict';

const assert = require('node:assert/strict');
const sqlite3 = require('sqlite3').verbose();
const { migrateMedicalTables } = require('../src/db/migrations/migrateMedicalTables');
const clinical = require('../src/services/medical/clinicalStateService');
const surveillance = require('../src/services/medical/immuneSurveillanceService');

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
  await db.exec('CREATE TABLE agents (id TEXT PRIMARY KEY, status TEXT)');
  await db.run('INSERT INTO agents (id, status) VALUES (?, ?)', 'clinical-agent', 'idle');
  await migrateMedicalTables(db);
  await clinical.initClinicalState(db, 'clinical-agent');
  const biopsy = await surveillance.biopsy(db, 'clinical-agent', 'iatrogenic_toxicity');
  const diagnosis = await surveillance.diagnose(db, 'clinical-agent', biopsy.biopsyRef);
  assert.equal(diagnosis.pathologyType, 'iatrogenic_toxicity');
  assert.equal(diagnosis.recommendedTherapy, 'supportive_care');
  await new Promise((resolve, reject) => database.close((error) => error ? reject(error) : resolve()));
  console.log('Clinical diagnosis maps SQLite pathology fields: PASS');
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
