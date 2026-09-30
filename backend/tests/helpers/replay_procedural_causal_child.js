'use strict';

const sqlite3 = require('sqlite3').verbose();
const handlers = require('../../src/services/primitiveHandlers/proceduralHandlers');
const registry = require('../../src/services/proceduralRegistryService');

function databaseAdapter(db) {
  return {
    exec: (sql) => new Promise((resolve, reject) => db.exec(sql, (error) => error ? reject(error) : resolve())),
    run: (sql, params) => new Promise((resolve, reject) => db.run(sql, params, function done(error) {
      if (error) return reject(error);
      resolve({ changes: this.changes });
    })),
    get: (sql, params) => new Promise((resolve, reject) => db.get(sql, params, (error, result) => error ? reject(error) : resolve(result))),
    all: (sql, params) => new Promise((resolve, reject) => db.all(sql, params, (error, result) => error ? reject(error) : resolve(result))),
  };
}

async function main() {
  const [filename, forkId] = process.argv.slice(2);
  const raw = new sqlite3.Database(filename);
  try {
    registry.registerSnapshot('causal-snapshot-b', { start: 1 });
    registry.registerEnvironment('causal-env', { version: 1 });
    let resume = null;
    registry.registerRunner('causal-runner', async (arm, state, control) => {
      resume = control.resume;
      await control.checkpoint(state);
      return { metric: arm.metric, trajectory: [{ metric: arm.metric }] };
    });
    const result = await handlers.replayCausalFork({ db: databaseAdapter(raw), forkId,
      runnerId: 'causal-runner', environmentId: 'causal-env', snapshotId: 'causal-snapshot-b',
      environmentManifest: { version: 1 } });
    console.log(JSON.stringify({ resume, forkId: result.forkId, resultHash: result.resultHash }));
  } finally {
    await new Promise((resolve, reject) => raw.close((error) => error ? reject(error) : resolve()));
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
