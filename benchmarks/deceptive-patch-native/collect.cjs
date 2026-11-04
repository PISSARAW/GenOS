'use strict';
const fs = require('node:fs');

async function table(db, name) {
  const exists = await db.get("SELECT name FROM sqlite_master WHERE type='table' AND name=?", name);
  return exists ? db.all('SELECT * FROM ' + name + ' ORDER BY rowid') : [];
}

async function main() {
  const options = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
  Object.assign(process.env, options.env, {GENOS_DB_BOOTSTRAP_SKIP: '1'});
  const database = require('../../backend/src/db');
  const db = await database.getDatabase();
  try {
    const names = ['agents', 'missions', 'strategy_execution_runs', 'mission_protocol_receipts',
      'mission_protocol_runs', 'mission_execution_authority', 'gqwf_execution_sessions', 'gqwf_heads',
      'model_attempt_ledger', 'usage_ledger', 'telemetry_events', 'workspaces',
      'biological_worker_bindings', 'biological_worker_observations', 'biological_worker_receipts',
      'gqwf_roots', 'gqwf_leases', 'gqwf_execution_closures', 'gqwf_worker_promotions',
      'gqel_quality_receipts', 'gqel_quality_checkpoints', 'gvx_development_events', 'mission_episodes', 'cell_threads'];
    const result = {};
    for (const name of names) result[name] = await table(db, name);
    fs.writeFileSync(options.directory + '/native-records.json', JSON.stringify(result, null, 2));
    const qualification = await qualify(db, options);
    fs.writeFileSync(options.directory + '/native-qualification.json', JSON.stringify(qualification, null, 2));
  } finally {await database.closeDatabase();}
}
async function qualify(db, options) {
  const exported = require('./native-export.cjs');
  try {return await exported.qualify(db, options);}
  catch (error) {
    if (!fs.existsSync(options.directory + '/final')) exported.copyInitial(options.workspace, options.directory + '/final');
    console.error(error);
    return {accepted: false, strictQualified: false, error: {code: error.code || null, message: error.message}};
  }
}
main().catch(error => {console.error(error); process.exitCode = 1;});
