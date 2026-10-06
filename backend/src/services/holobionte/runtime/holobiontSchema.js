'use strict';

async function initializeHolobiontSchema(db) {
  const migrations = ['Sessions', 'Contracts', 'Memory', 'Ledger', 'ImmunePlane', 'VariantEvents'];
  for (const name of migrations) {
    await require(`../../../db/migrations/migrateHolobiont${name}`)[`migrateHolobiont${name}`](db);
  }
}

module.exports = { initializeHolobiontSchema };
