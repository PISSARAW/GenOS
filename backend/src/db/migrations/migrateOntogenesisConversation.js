'use strict';

/**
 * Migration 088 — conversation permanente de l'Ontogenèse (ADR 0235 §7-8).
 * Inbox, événements de réveil, mémoire avec provenance, notifications
 * sobres, demandes d'approbation. Idempotente.
 */

async function migrateOntogenesisConversation(db) {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS ontogenesis_inbox (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES ontogenesis_projects(id) ON DELETE CASCADE,
      kind TEXT NOT NULL DEFAULT 'user'
        CHECK (kind IN ('user', 'priority', 'stop', 'system')),
      body TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'applied', 'rejected')),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_onto_inbox_project
      ON ontogenesis_inbox(project_id, status, created_at);
    CREATE TABLE IF NOT EXISTS ontogenesis_events (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES ontogenesis_projects(id) ON DELETE CASCADE,
      type TEXT NOT NULL
        CHECK (type IN ('git', 'worker_done', 'resource', 'deadline', 'user_reply', 'wake')),
      payload_json TEXT NOT NULL DEFAULT '{}',
      consumed INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_onto_events_project
      ON ontogenesis_events(project_id, consumed, created_at);
    CREATE TABLE IF NOT EXISTS ontogenesis_memory (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES ontogenesis_projects(id) ON DELETE CASCADE,
      kind TEXT NOT NULL
        CHECK (kind IN ('preference', 'decision', 'constraint', 'failure', 'question')),
      content TEXT NOT NULL DEFAULT '',
      provenance_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_onto_memory_project
      ON ontogenesis_memory(project_id, kind, created_at);
    CREATE TABLE IF NOT EXISTS ontogenesis_notifications (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES ontogenesis_projects(id) ON DELETE CASCADE,
      kind TEXT NOT NULL
        CHECK (kind IN ('result', 'blocked', 'decision_needed')),
      payload_json TEXT NOT NULL DEFAULT '{}',
      status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'sent', 'acked')),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_onto_notifications_project
      ON ontogenesis_notifications(project_id, status, created_at);
    CREATE TABLE IF NOT EXISTS ontogenesis_approval_requests (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES ontogenesis_projects(id) ON DELETE CASCADE,
      action TEXT NOT NULL,
      scope_json TEXT NOT NULL DEFAULT '{}',
      status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'approved', 'denied')),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_onto_approvals_project
      ON ontogenesis_approval_requests(project_id, status, created_at);
  `);
}

module.exports = { migrateOntogenesisConversation };
