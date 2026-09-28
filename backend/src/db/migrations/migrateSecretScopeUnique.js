'use strict';

async function migrateSecretScopeUnique(db) {
  // Enforce the (name, organization_id, project_id) uniqueness the secret
  // routes rely on to return 409 instead of 500 under concurrent creates.
  // Best-effort: pre-existing duplicates keep the migration from blocking boot.
  try {
    await db.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_secrets_scoped_name
        ON secrets(name, organization_id, project_id);
    `);
  } catch (error) {
    console.warn('[DB] Could not enforce unique secret scope (continuing boot):', error.message);
  }
}

module.exports = { migrateSecretScopeUnique };
