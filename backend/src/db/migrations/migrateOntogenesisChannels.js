'use strict';

/**
 * Migration 094 — canaux de conversation (roadmap §P6).
 * Même projet joignable sur plusieurs canaux ; le routage choisit
 * où porter chaque retour. L'envoi réel passe par des adaptateurs
 * branchés ensuite ; le routage, lui, est décidé et tracé ici.
 */

async function migrateOntogenesisChannels(db) {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS ontogenesis_channels (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES ontogenesis_projects(id) ON DELETE CASCADE,
      channel TEXT NOT NULL
        CHECK (channel IN ('cli', 'slack', 'teams', 'voice', 'webhook')),
      direction TEXT NOT NULL CHECK (direction IN ('in', 'out')),
      enabled INTEGER NOT NULL DEFAULT 1,
      config_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (project_id, channel, direction)
    );
    CREATE INDEX IF NOT EXISTS idx_onto_channels_project
      ON ontogenesis_channels(project_id, direction, enabled);
  `);
}

module.exports = { migrateOntogenesisChannels };
