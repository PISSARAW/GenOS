'use strict';

// Autobiographical memory: episodes (lived experience), lessons (consolidated,
// conditional, falsifiable rules) and a per-agent self-model.

async function migrateAutobiographicalMemory(db) {
  await db.exec(`CREATE TABLE IF NOT EXISTS autobiographical_episodes (
    id TEXT PRIMARY KEY,
    agent_id TEXT NOT NULL,
    mission_id TEXT,
    kind TEXT NOT NULL,
    salience REAL NOT NULL DEFAULT 0,
    situation_json TEXT NOT NULL DEFAULT '{}',
    decision_json TEXT NOT NULL DEFAULT '{}',
    action_json TEXT NOT NULL DEFAULT '{}',
    outcome_json TEXT NOT NULL DEFAULT '{}',
    lesson_json TEXT NOT NULL DEFAULT '{}',
    is_forgotten INTEGER NOT NULL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    CHECK (json_valid(situation_json)), CHECK (json_valid(decision_json)),
    CHECK (json_valid(action_json)), CHECK (json_valid(outcome_json)), CHECK (json_valid(lesson_json))
  )`);
  await db.exec(`CREATE INDEX IF NOT EXISTS idx_autobio_episodes_agent ON autobiographical_episodes(agent_id, created_at)`);
  await db.exec(`CREATE INDEX IF NOT EXISTS idx_autobio_episodes_mission ON autobiographical_episodes(mission_id)`);
  await db.exec(`CREATE INDEX IF NOT EXISTS idx_autobio_episodes_kind ON autobiographical_episodes(kind, salience)`);

  await db.exec(`CREATE TABLE IF NOT EXISTS autobiographical_lessons (
    id TEXT PRIMARY KEY,
    scope TEXT NOT NULL,
    claim TEXT NOT NULL,
    confidence REAL NOT NULL DEFAULT 0.5,
    supporting_episodes_json TEXT NOT NULL DEFAULT '[]',
    counter_examples_json TEXT NOT NULL DEFAULT '[]',
    reuse_conditions_json TEXT NOT NULL DEFAULT '[]',
    avoid_conditions_json TEXT NOT NULL DEFAULT '[]',
    recommended_action TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    CHECK (json_valid(supporting_episodes_json)), CHECK (json_valid(counter_examples_json)),
    CHECK (json_valid(reuse_conditions_json)), CHECK (json_valid(avoid_conditions_json))
  )`);
  await db.exec(`CREATE INDEX IF NOT EXISTS idx_autobio_lessons_scope ON autobiographical_lessons(scope, confidence)`);

  await db.exec(`CREATE TABLE IF NOT EXISTS agent_self_models (
    agent_id TEXT PRIMARY KEY,
    self_model_json TEXT NOT NULL DEFAULT '{}',
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    CHECK (json_valid(self_model_json))
  )`);
}

module.exports = { migrateAutobiographicalMemory };
