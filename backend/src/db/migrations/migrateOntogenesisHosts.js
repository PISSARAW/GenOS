'use strict';

/**
 * Migration 095 — hôtes distants et pairing local (roadmap §P8).
 * Le contrôleur et les workers peuvent vivre sur une machine
 * toujours disponible ; une seule machine locale est appairée
 * à la fois par projet. Codes à usage unique avec expiration.
 */

async function migrateOntogenesisHosts(db) {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS ontogenesis_hosts (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES ontogenesis_projects(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK (role IN ('controller', 'worker', 'local')),
      endpoint TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'paired', 'retired')),
      pairing_code TEXT,
      code_expires_at TEXT,
      last_seen TEXT,
      capabilities_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (project_id, role, endpoint)
    );
    CREATE INDEX IF NOT EXISTS idx_onto_hosts_project
      ON ontogenesis_hosts(project_id, role, status);
  `);
}

module.exports = { migrateOntogenesisHosts };
