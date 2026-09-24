'use strict';

async function migrateHolobiontImmunePlane(db) {
  const columns = await db.all('PRAGMA table_info(holobiont_symbiosis_ledger)');
  if (!columns.some((column) => column.name === 'immune_review_json')) {
    await db.exec(`ALTER TABLE holobiont_symbiosis_ledger
      ADD COLUMN immune_review_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(immune_review_json))`);
  }
}

module.exports = { migrateHolobiontImmunePlane };
