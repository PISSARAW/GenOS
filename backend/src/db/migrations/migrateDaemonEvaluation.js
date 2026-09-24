'use strict';

/**
 * Migration 055 — évaluation daemon (ADR 0034 D17/D18/D20).
 *
 * daemon_eval_runs : bras comparés (cold vs warm, ablations) avec
 * métriques déterministes — jamais un score LLM brut comme preuve.
 * daemon_promotions : reçus de maturité experimental → stable,
 * accordés seulement si les seuils de preuve sont tenus.
 */

const EVAL_KINDS_SQL = "'warm-start', 'ablation', 'live-protocol'";

async function migrateDaemonEvaluation(db) {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS daemon_eval_runs (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL DEFAULT 'warm-start'
        CHECK (kind IN (${EVAL_KINDS_SQL})),
      arm TEXT NOT NULL,
      territory_id TEXT NOT NULL,
      head_sha TEXT NOT NULL,
      metrics_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_daemon_eval_runs_kind
      ON daemon_eval_runs(kind, created_at);

    CREATE TABLE IF NOT EXISTS daemon_promotions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      from_maturity TEXT NOT NULL,
      to_maturity TEXT NOT NULL
        CHECK (to_maturity IN ('EXPERIMENTAL', 'STABLE')),
      verdict TEXT NOT NULL,
      evidence_json TEXT NOT NULL DEFAULT '{}',
      decided_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  await widenKindCheck(db);
}

async function widenKindCheck(db) {
  const row = await db.get(
    "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'daemon_eval_runs'"
  );
  const sql = (row && row.sql) || '';
  if (sql.includes('live-protocol')) return;
  await db.exec(`
    CREATE TABLE IF NOT EXISTS daemon_eval_runs_v2 (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL DEFAULT 'warm-start'
        CHECK (kind IN (${EVAL_KINDS_SQL})),
      arm TEXT NOT NULL,
      territory_id TEXT NOT NULL,
      head_sha TEXT NOT NULL,
      metrics_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    INSERT OR IGNORE INTO daemon_eval_runs_v2
      (id, kind, arm, territory_id, head_sha, metrics_json, created_at)
      SELECT id, kind, arm, territory_id, head_sha, metrics_json, created_at
      FROM daemon_eval_runs;
    DROP TABLE daemon_eval_runs;
    ALTER TABLE daemon_eval_runs_v2 RENAME TO daemon_eval_runs;
    CREATE INDEX IF NOT EXISTS idx_daemon_eval_runs_kind
      ON daemon_eval_runs(kind, created_at);
  `);
}

module.exports = { migrateDaemonEvaluation };
