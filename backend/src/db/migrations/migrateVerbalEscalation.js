'use strict';

/**
 * Migration 052 — escalade verbale bornée (Phase 9).
 *
 * Le verbal est l'exception : micro-utterance d'abord, dialogue borné
 * ensuite (budget tokens réels, tours max, deadline). Tout dialogue se
 * termine par un artefact structuré ou UNRESOLVED explicite.
 */

async function migrateVerbalEscalation(db) {
  await db.exec(`CREATE TABLE IF NOT EXISTS verbal_escalations (
    id TEXT PRIMARY KEY, trigger TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'micro_pending',
    participants_json TEXT NOT NULL DEFAULT '[]', unresolved_question TEXT NOT NULL,
    domain TEXT, token_budget INTEGER NOT NULL DEFAULT 200, tokens_used INTEGER NOT NULL DEFAULT 0,
    max_turns INTEGER NOT NULL DEFAULT 8, deadline_at DATETIME, required_artifact TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    CHECK (status IN ('micro_pending', 'micro_exhausted', 'dialogue_open', 'resolved', 'unresolved')),
    CHECK (json_valid(participants_json))
  );
  CREATE TABLE IF NOT EXISTS dialogue_turns (
    id INTEGER PRIMARY KEY AUTOINCREMENT, escalation_id TEXT NOT NULL, seq INTEGER NOT NULL,
    speaker_agent_id TEXT NOT NULL, utterance_text TEXT NOT NULL,
    speech_act_json TEXT NOT NULL DEFAULT '{}', tokens_used INTEGER NOT NULL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (escalation_id, seq)
  );
  CREATE INDEX IF NOT EXISTS idx_dialogue_turns_esc ON dialogue_turns(escalation_id, seq);
  CREATE TABLE IF NOT EXISTS dialogue_artifacts (
    escalation_id TEXT PRIMARY KEY, kind TEXT NOT NULL,
    artifact_json TEXT NOT NULL DEFAULT '{}', created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    CHECK (json_valid(artifact_json))
  );`);
}

module.exports = { migrateVerbalEscalation };
