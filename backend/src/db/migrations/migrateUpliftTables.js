'use strict';

async function migrateUpliftTables(db) {
  await db.exec(`CREATE TABLE IF NOT EXISTS uplift_runs (
        id TEXT PRIMARY KEY,
        suite TEXT NOT NULL,
        case_id TEXT NOT NULL,
        model TEXT NOT NULL,
        mode TEXT NOT NULL CHECK (mode IN ('solo','genos','compute_control','ablation')),
        genos_commit TEXT,
        topology TEXT,
        declared_caps_json TEXT NOT NULL DEFAULT '[]',
        activated_caps_json TEXT NOT NULL DEFAULT '[]',
        observed_caps_json TEXT NOT NULL DEFAULT '[]',
        seed INTEGER,
        tokens INTEGER,
        cost_usd REAL,
        latency_ms REAL,
        score REAL,
        result_json TEXT NOT NULL DEFAULT '{}',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_uplift_runs_suite ON uplift_runs(suite, case_id, mode);
    CREATE TABLE IF NOT EXISTS uplift_pairs (
        id TEXT PRIMARY KEY,
        suite TEXT NOT NULL,
        case_id TEXT NOT NULL,
        solo_run_id TEXT NOT NULL,
        genos_run_id TEXT NOT NULL,
        delta REAL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (solo_run_id) REFERENCES uplift_runs(id) ON DELETE CASCADE,
        FOREIGN KEY (genos_run_id) REFERENCES uplift_runs(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS uplift_comparisons (
        id TEXT PRIMARY KEY,
        suite TEXT NOT NULL,
        base_model TEXT NOT NULL,
        genos_commit TEXT,
        delta REAL,
        lcb REAL,
        ucb REAL,
        beaten INTEGER NOT NULL DEFAULT 0,
        highest_beaten TEXT,
        tier_uplift INTEGER,
        cost_multiplier REAL,
        token_multiplier REAL,
        payload_json TEXT NOT NULL DEFAULT '{}',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );`);
}

module.exports = { migrateUpliftTables };
