/**
 * Migration V015 — genome_events table (event sourcing unifié).
 */

const { migrationRunners } = require('./registry');

const migrationV015 = {
  name: 'V015_genome_event_log',
  description: 'Table genome_events pour l\'event sourcing unifié du génome',
  run: async (db) => {
    await db.exec(`
      CREATE TABLE IF NOT EXISTS genome_events (
        id TEXT PRIMARY KEY,
        genome_ref TEXT NOT NULL,
        event_type TEXT NOT NULL,
        payload_json TEXT NOT NULL DEFAULT '{}',
        parent_event_id TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        organization_id TEXT,
        project_id TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_genome_events_genome_ref ON genome_events(genome_ref);
      CREATE INDEX IF NOT EXISTS idx_genome_events_type ON genome_events(event_type);
    `);
  },
};

migrationRunners.push(migrationV015);

module.exports = { migrationV015 };
