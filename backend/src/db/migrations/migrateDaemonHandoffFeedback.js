'use strict';

/**
 * Migration 045 — feedback des handoffs (ADR 0034 D12).
 *
 * L'orchestrateur retourne USED/DECISIVE/IRRELEVANT/STALE/WRONG/
 * INCOMPLETE par (brief, finding). Ces signaux nourrissent la
 * plasticité : un finding présenté 8 fois et toujours ignoré
 * est démote (relevanceScore.demote) au lieu de polluer les
 * briefs suivants. Pas d'entraînement de modèle — comptage
 * explicite, comme la plasticité synaptique existante.
 */

async function migrateDaemonHandoffFeedback(db) {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS daemon_handoff_feedback (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      brief_id TEXT NOT NULL,
      finding_id TEXT NOT NULL,
      verdict TEXT NOT NULL
        CHECK (verdict IN ('USED', 'DECISIVE', 'IRRELEVANT', 'STALE', 'WRONG', 'INCOMPLETE')),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_handoff_feedback_finding
      ON daemon_handoff_feedback(finding_id, verdict);
    CREATE INDEX IF NOT EXISTS idx_handoff_feedback_brief
      ON daemon_handoff_feedback(brief_id);
  `);
}

module.exports = { migrateDaemonHandoffFeedback };
