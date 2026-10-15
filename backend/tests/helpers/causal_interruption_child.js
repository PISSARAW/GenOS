'use strict';

const sqlite3 = require('sqlite3').verbose();
const registry = require('../../src/services/proceduralRegistryService');
const handlers = require('../../src/services/primitiveHandlers/proceduralHandlers');
const runner = require('./controlled_causal_runner');

function databaseAdapter(db) {
  return {
    exec: (sql) => new Promise((resolve, reject) => db.exec(sql, (error) => error ? reject(error) : resolve())),
    run: (sql, params) => new Promise((resolve, reject) => db.run(sql, params, function done(error) {
      if (error) return reject(error);
      resolve({ changes: this.changes });
    })),
    get: (sql, params) => new Promise((resolve, reject) => db.get(sql, params, (error, row) => error ? reject(error) : resolve(row))),
    all: (sql, params) => new Promise((resolve, reject) => db.all(sql, params, (error, rows) => error ? reject(error) : resolve(rows))),
  };
}

async function main() {
  const [filename, forkId] = process.argv.slice(2);
  const raw = new sqlite3.Database(filename);
  try {
    registry.registerSnapshot('interrupt-snapshot', { step: 0, value: 0 });
    registry.registerEnvironment('interrupt-environment', { revision: 'fixed-1' });
    registry.registerRunner('interrupt-runner', runner);
    const result = await handlers.replayCausalFork({ db: databaseAdapter(raw), forkId,
      runnerId: 'interrupt-runner', environmentId: 'interrupt-environment', snapshotId: 'interrupt-snapshot' });
    process.stdout.write(`${JSON.stringify({ resultHash: result.resultHash, result: result.result })}\n`);
  } finally {
    await new Promise((resolve, reject) => raw.close((error) => error ? reject(error) : resolve()));
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
