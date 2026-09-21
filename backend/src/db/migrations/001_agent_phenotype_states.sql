-- Migration: table agent_phenotype_states
-- Compatible avec le code existant (genome_id, state_json)
-- + nouvelles colonnes pour branches, atrophies, history

CREATE TABLE IF NOT EXISTS agent_phenotype_states (
    id TEXT PRIMARY KEY,
    agent_id TEXT,
    genome_id TEXT,
    state_json TEXT,
    phenotype_json TEXT NOT NULL DEFAULT '{}',
    branches_json TEXT NOT NULL DEFAULT '[]',
    atrophies_json TEXT NOT NULL DEFAULT '[]',
    history_json TEXT NOT NULL DEFAULT '[]',
    strength REAL NOT NULL DEFAULT 0.5,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_agent_phenotype_agent ON agent_phenotype_states(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_phenotype_genome ON agent_phenotype_states(genome_id);
CREATE INDEX IF NOT EXISTS idx_agent_phenotype_strength ON agent_phenotype_states(strength);
