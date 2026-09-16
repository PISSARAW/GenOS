'use strict';

/**
 * Property Service Schema — DB tables for property/supervenience tracking.
 */

async function ensurePropertyTables(db) {
  await db.exec(`
CREATE TABLE IF NOT EXISTS property_supervenience (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    agent_id TEXT NOT NULL,
    supervenient_property TEXT NOT NULL,
    base_type TEXT NOT NULL CHECK (base_type IN ('physical', 'computational', 'functional', 'biological')),
    established_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_prop_superv_agent ON property_supervenience(agent_id);

CREATE TABLE IF NOT EXISTS supervenience_mappings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    agent_id TEXT NOT NULL,
    base_hash TEXT NOT NULL,
    supervenient_hash TEXT NOT NULL,
    property_key TEXT NOT NULL,
    base_type TEXT NOT NULL,
    verified_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_superv_map_agent ON supervenience_mappings(agent_id);
CREATE INDEX IF NOT EXISTS idx_superv_map_base ON supervenience_mappings(base_hash);

CREATE TABLE IF NOT EXISTS dispositional_properties (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    agent_id TEXT NOT NULL,
    property_key TEXT NOT NULL,
    stimulus_conditions TEXT NOT NULL DEFAULT '[]',
    manifestation TEXT,
    causal_power TEXT,
    strength REAL DEFAULT 1.0,
    ceteris_paribus INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_disp_prop_agent ON dispositional_properties(agent_id);

CREATE TABLE IF NOT EXISTS dispositional_manifestations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    agent_id TEXT NOT NULL,
    property_key TEXT NOT NULL,
    manifestation TEXT,
    stimulus_conditions TEXT,
    manifested_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_disp_manif_agent ON dispositional_manifestations(agent_id);

CREATE TABLE IF NOT EXISTS emergent_properties (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    agent_id TEXT NOT NULL,
    property_key TEXT NOT NULL,
    constituent_properties TEXT NOT NULL DEFAULT '[]',
    emergence_type TEXT NOT NULL CHECK (emergence_type IN ('weak', 'strong', 'synergistic')),
    systemic_function TEXT,
    irreducibility_proof TEXT,
    downward_causation INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_emergent_agent ON emergent_properties(agent_id);
  `);
}
module.exports = { ensurePropertyTables };
