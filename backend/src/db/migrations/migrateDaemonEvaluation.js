'use strict';

/**
 * Migration 055 — évaluation daemon (ADR 0034 D17/D18/D20).
 *
 * daemon_eval_runs : bras comparés (cold vs warm, ablations) avec
 * métriques déterministes — jamais un score LLM brut comme preuve.
 * daemon_promotions : reçus de maturité experimental → stable,
 * accordés seulement si les seuils de preuve sont tenus.
 */

async function migrateDaemonEvaluation(db) {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS daemon_eval_runs (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL DEFAULT 'warm-start'
        CHECK (kind IN ('warm-start', 'ablation')),
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
}

module.exports = { migrateDaemonEvaluation };
