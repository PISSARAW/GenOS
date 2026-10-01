'use strict';

/**
 * Migration 091 — questions de clarification (roadmap §P3).
 * Questions typées avec choix, défaut et échéance ; la réponse
 * réveille WAITING_INPUT via un événement user_reply.
 */

async function migrateOntogenesisQuestions(db) {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS ontogenesis_questions (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES ontogenesis_projects(id) ON DELETE CASCADE,
      task_id TEXT,
      kind TEXT NOT NULL CHECK (kind IN ('choice', 'confirm', 'info')),
      question TEXT NOT NULL DEFAULT '',
      options_json TEXT NOT NULL DEFAULT '[]',
      default_choice TEXT,
      deadline_at TEXT,
      status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'answered', 'expired')),
      answer TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_onto_questions_project
      ON ontogenesis_questions(project_id, status, created_at);
  `);
}

module.exports = { migrateOntogenesisQuestions };
