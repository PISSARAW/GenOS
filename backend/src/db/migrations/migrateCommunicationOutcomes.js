'use strict';

/**
 * Migration 053 — journal des issues de communication (Phase 12).
 *
 * Chaque issue alimente : expertise (succès/échec), common ground
 * (correction si déjà connu), dialectes (confiance), relations
 * (familiarité) et plasticité des canaux. Base des métriques Phase 13.
 */

async function migrateCommunicationOutcomes(db) {
  await db.exec(`CREATE TABLE IF NOT EXISTS communication_outcomes (
    id INTEGER PRIMARY KEY AUTOINCREMENT, sender_id TEXT NOT NULL, receiver_id TEXT NOT NULL,
    domain TEXT, refs_json TEXT NOT NULL DEFAULT '[]', channel TEXT, outcome TEXT NOT NULL,
    action_taken INTEGER NOT NULL DEFAULT 0, recipient_knew INTEGER NOT NULL DEFAULT 0,
    tokens_used INTEGER NOT NULL DEFAULT 0, created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    CHECK (json_valid(refs_json))
  );
  CREATE INDEX IF NOT EXISTS idx_communication_outcomes_pair ON communication_outcomes(sender_id, receiver_id, created_at);`);
}

module.exports = { migrateCommunicationOutcomes };
