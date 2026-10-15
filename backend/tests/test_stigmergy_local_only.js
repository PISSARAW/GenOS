'use strict';

const assert = require('node:assert/strict');
const database = require('../src/db');
const stigmergy = require('../src/services/epistemic/stigmergyInterProcessBridge');

async function run() {
  const originalGetDatabase = database.getDatabase;
  let databaseLookups = 0;
  let databaseWrites = 0;
  database.getDatabase = async () => {
    databaseLookups += 1;
    throw new Error('Local-only pheromones must not open a database.');
  };
  try {
    const result = await stigmergy.depositPheromone({
      type: stigmergy.SIGNAL_TYPES.EPISTEMIC_VERIFIER_SUCCESS,
      payload: { claimId: 'local-only-test' },
      locus: 'local-only-test',
      intensity: 0.5,
      isRepellent: false,
    }, { db: { run: async () => { databaseWrites += 1; } }, localOnly: true });
    assert.equal(result.localOnly, true);
    assert.equal(databaseLookups, 0);
    assert.equal(databaseWrites, 0);
  } finally {
    database.getDatabase = originalGetDatabase;
  }
}

run().then(() => console.log('Local-only pheromones skip global database lookup: PASS'))
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
