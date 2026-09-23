'use strict';

/**
 * Migration 047 — mémoire transitive et shadow log (Phases 4-5).
 *
 * agent_expertise : qui sait quoi (compétence vérifiée par domaine).
 * communication_shadow_log : décisions du PolicyEngine en shadow mode,
 * comparées au comportement courant sans modifier le runtime.
 */

async function migrateTransactiveMemory(db) {
  await db.exec(`CREATE TABLE IF NOT EXISTS agent_expertise (
    agent_id TEXT NOT NULL, domain TEXT NOT NULL,
    competence REAL NOT NULL DEFAULT 0, calibration REAL NOT NULL DEFAULT 0,
    reliability REAL NOT NULL DEFAULT 0, evidence_count INTEGER NOT NULL DEFAULT 0,
    freshness REAL NOT NULL DEFAULT 0, last_success DATETIME,
    capabilities_json TEXT NOT NULL DEFAULT '[]', tools_json TEXT NOT NULL DEFAULT '[]',
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (agent_id, domain)
  );
  CREATE INDEX IF NOT EXISTS idx_agent_expertise_domain ON agent_expertise(domain, competence DESC);
  CREATE TABLE IF NOT EXISTS communication_shadow_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    intent_json TEXT NOT NULL DEFAULT '{}', decision_json TEXT NOT NULL DEFAULT '{}',
    current_behavior_json TEXT NOT NULL DEFAULT '{}',
    utility REAL NOT NULL DEFAULT 0, gain REAL NOT NULL DEFAULT 0, cost REAL NOT NULL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    CHECK (json_valid(intent_json)), CHECK (json_valid(decision_json))
  );
  CREATE INDEX IF NOT EXISTS idx_shadow_log_created ON communication_shadow_log(created_at);`);
}

module.exports = { migrateTransactiveMemory };
