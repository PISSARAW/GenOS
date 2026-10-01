'use strict';

/**
 * Migration 090 — planification récurrente de l'Ontogenèse (roadmap §P1).
 * Échéances et intervalles persistés ; le runner les transforme en
 * événements. Idempotente.
 */

async function migrateOntogenesisSchedule(db) {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS ontogenesis_schedules (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES ontogenesis_projects(id) ON DELETE CASCADE,
      kind TEXT NOT NULL
        CHECK (kind IN ('interval', 'once', 'deadline')),
      spec_json TEXT NOT NULL DEFAULT '{}',
      timezone TEXT NOT NULL DEFAULT 'UTC',
      next_run_at TEXT NOT NULL,
      last_run_at TEXT,
      status TEXT NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'paused', 'done')),
      payload_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_onto_sched_due
      ON ontogenesis_schedules(project_id, status, next_run_at);
  `);
}

module.exports = { migrateOntogenesisSchedule };
