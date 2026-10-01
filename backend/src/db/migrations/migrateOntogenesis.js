'use strict';

/**
 * Migration 086 — état durable de l'Ontogenèse (ADR 0235).
 * Six tables + claims transactionnels. Idempotente.
 */

async function migrateOntogenesis(db) {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS ontogenesis_projects (
      id TEXT PRIMARY KEY,
      root_path TEXT NOT NULL,
      branch TEXT NOT NULL DEFAULT 'codex/ontogenesis',
      objective TEXT NOT NULL DEFAULT '',
      config_json TEXT NOT NULL DEFAULT '{}',
      config_version INTEGER NOT NULL DEFAULT 1,
      state TEXT NOT NULL DEFAULT 'INITIALIZING'
        CHECK (state IN (
          'INITIALIZING', 'PLANNING', 'EXECUTING', 'VERIFYING',
          'INTEGRATING', 'SLEEPING_RESOURCE', 'WAITING_INPUT',
          'IDLE', 'PAUSED', 'STOPPING', 'STOPPED'
        )),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS ontogenesis_backlog (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES ontogenesis_projects(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'todo'
        CHECK (status IN ('todo', 'doing', 'verifying', 'integrating', 'done', 'blocked')),
      priority INTEGER NOT NULL DEFAULT 0,
      depends_on_json TEXT NOT NULL DEFAULT '[]',
      acceptance_json TEXT NOT NULL DEFAULT '[]',
      attempt INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_onto_backlog_project
      ON ontogenesis_backlog(project_id, status, priority);
    CREATE TABLE IF NOT EXISTS ontogenesis_runs (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES ontogenesis_projects(id) ON DELETE CASCADE,
      task_id TEXT,
      topology TEXT NOT NULL,
      variant TEXT,
      worker_json TEXT NOT NULL DEFAULT '{}',
      budgets_json TEXT NOT NULL DEFAULT '{}',
      attempt INTEGER NOT NULL DEFAULT 1,
      status TEXT NOT NULL DEFAULT 'running'
        CHECK (status IN ('running', 'verified', 'unverified', 'failed', 'integrated')),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_onto_runs_project
      ON ontogenesis_runs(project_id, status);
    CREATE TABLE IF NOT EXISTS ontogenesis_decisions (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES ontogenesis_projects(id) ON DELETE CASCADE,
      task_id TEXT,
      alternatives_json TEXT NOT NULL DEFAULT '[]',
      rationale TEXT NOT NULL DEFAULT '',
      evidence_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS ontogenesis_integrations (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES ontogenesis_projects(id) ON DELETE CASCADE,
      task_id TEXT,
      base_sha TEXT NOT NULL,
      result_sha TEXT,
      status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'committed', 'conflict', 'rejected')),
      checks_json TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS ontogenesis_control (
      project_id TEXT PRIMARY KEY REFERENCES ontogenesis_projects(id) ON DELETE CASCADE,
      mode TEXT NOT NULL DEFAULT 'running'
        CHECK (mode IN ('running', 'paused', 'stopping', 'stopped', 'sleeping_resource', 'waiting_input')),
      reason TEXT NOT NULL DEFAULT '',
      resume_json TEXT NOT NULL DEFAULT '{}',
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS ontogenesis_claims (
      project_id TEXT PRIMARY KEY,
      owner TEXT NOT NULL,
      operation_id TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
}

module.exports = { migrateOntogenesis };
