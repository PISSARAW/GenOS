/**
 * GenOS Database Schema Definition
 * 18 Normalized SQLite Tables + Performance Indexes
 *
 * Split across schema-tables-core / schema-tables-extensions /
 * schema-migrations to keep every file under the 400-line gate.
 */

const { TABLES_CORE } = require("./schema-tables-core");
const { TABLES_EXTENSIONS, CREATE_INDEXES_SQL } = require("./schema-tables-extensions");
const { migrateLegacySchema, applyVersionedMigrations } = require("./schema-migrations");

const CREATE_TABLES_SQL = TABLES_CORE + "\n" + TABLES_EXTENSIONS;

async function initializeSchema(db) {
  await db.exec('PRAGMA journal_mode = WAL;');
  await db.exec('PRAGMA busy_timeout = 5000;');
  await db.exec('PRAGMA synchronous = NORMAL;');
  await db.exec('PRAGMA foreign_keys = ON;');
  await migrateLegacySchema(db);
  await db.exec(CREATE_TABLES_SQL);
  await applyVersionedMigrations(db);
  await db.run('INSERT OR IGNORE INTO resilience_policies (id) VALUES (1)');
  for (const eventType of ['error', 'cognitive_drift', 'budget', 'blocked', 'human_escalation']) {
    await db.run('INSERT OR IGNORE INTO notification_preferences (event_type) VALUES (?)', eventType);
  }
  await db.exec(CREATE_INDEXES_SQL);
}

module.exports = {
  initializeSchema,
  CREATE_TABLES_SQL,
  CREATE_INDEXES_SQL
};
