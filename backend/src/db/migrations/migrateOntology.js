/**
 * Ontology tables for GenOS philosophical architecture.
 * Implements: Being, Substance, Attribute, Mode, Mereology, Essence/Accident, Hypostatization.
 */

async function createOntologyTables(db) {
  await db.exec(`
CREATE TABLE IF NOT EXISTS ontology_beings (
    id TEXT PRIMARY KEY,
    substance_type TEXT NOT NULL,
    essence_json TEXT NOT NULL DEFAULT '{}',
    identity_criteria_json TEXT NOT NULL DEFAULT '{}',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    ceased_at DATETIME
);
CREATE INDEX IF NOT EXISTS idx_ontology_beings_substance ON ontology_beings(substance_type);
CREATE INDEX IF NOT EXISTS idx_ontology_beings_ceased ON ontology_beings(ceased_at);
  `);

  await db.exec(`
CREATE TABLE IF NOT EXISTS ontology_attributes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    being_id TEXT NOT NULL,
    key TEXT NOT NULL,
    value_json TEXT NOT NULL,
    value_type TEXT NOT NULL,
    modality TEXT NOT NULL,
    provenance TEXT NOT NULL DEFAULT 'ontological',
    previous_value_json TEXT,
    changed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    valid_from DATETIME DEFAULT CURRENT_TIMESTAMP,
    valid_until DATETIME,
    FOREIGN KEY (being_id) REFERENCES ontology_beings(id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ontology_attr_being_key ON ontology_attributes(being_id, key, valid_from);
CREATE INDEX IF NOT EXISTS idx_ontology_attr_modality ON ontology_attributes(modality);
  `);

  await db.exec(`
CREATE TABLE IF NOT EXISTS ontology_modes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    being_id TEXT NOT NULL,
    mode TEXT NOT NULL,
    mode_constraint TEXT NOT NULL,
    state TEXT NOT NULL DEFAULT 'inactive',
    activation_condition_json TEXT,
    activated_at DATETIME,
    deactivated_at DATETIME,
    failure_reason TEXT,
    FOREIGN KEY (being_id) REFERENCES ontology_beings(id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ontology_mode_being_mode ON ontology_modes(being_id, mode);
CREATE INDEX IF NOT EXISTS idx_ontology_mode_state ON ontology_modes(state);
  `);

  await db.exec(`
CREATE TABLE IF NOT EXISTS ontology_mereology (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    whole_id TEXT NOT NULL,
    part_id TEXT NOT NULL,
    relation_type TEXT NOT NULL,
    is_essential_part INTEGER DEFAULT 0,
    proportion REAL,
    attached_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    detached_at DATETIME,
    FOREIGN KEY (whole_id) REFERENCES ontology_beings(id) ON DELETE CASCADE,
    FOREIGN KEY (part_id) REFERENCES ontology_beings(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_ontology_mereology_whole ON ontology_mereology(whole_id);
CREATE INDEX IF NOT EXISTS idx_ontology_mereology_part ON ontology_mereology(part_id);
CREATE INDEX IF NOT EXISTS idx_ontology_mereology_type ON ontology_mereology(relation_type);
  `);

  await db.exec(`
CREATE TABLE IF NOT EXISTS ontology_hypostatizations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_being_id TEXT NOT NULL,
    attribute_key TEXT NOT NULL,
    target_being_id TEXT NOT NULL,
    essence_extracted_json TEXT NOT NULL,
    hypostatization_type TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    completed_at DATETIME,
    reabsorbed_at DATETIME,
    FOREIGN KEY (source_being_id) REFERENCES ontology_beings(id) ON DELETE CASCADE,
    FOREIGN KEY (target_being_id) REFERENCES ontology_beings(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_ontology_hypo_source ON ontology_hypostatizations(source_being_id);
CREATE INDEX IF NOT EXISTS idx_ontology_hypo_target ON ontology_hypostatizations(target_being_id);
CREATE INDEX IF NOT EXISTS idx_ontology_hypo_status ON ontology_hypostatizations(status);
  `);

  await db.exec(`
CREATE TABLE IF NOT EXISTS ontology_identity_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    being_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    description TEXT,
    previous_essence_hash TEXT,
    new_essence_hash TEXT,
    continuity_preserved INTEGER DEFAULT 1,
    identity_score REAL DEFAULT 1.0,
    metadata_json TEXT DEFAULT '{}',
    occurred_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (being_id) REFERENCES ontology_beings(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_ontology_identity_being ON ontology_identity_events(being_id);
CREATE INDEX IF NOT EXISTS idx_ontology_identity_type ON ontology_identity_events(event_type);
CREATE INDEX IF NOT EXISTS idx_ontology_identity_continuity ON ontology_identity_events(continuity_preserved);
  `);

  await db.exec(`
CREATE TABLE IF NOT EXISTS ontology_attribute_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    being_id TEXT NOT NULL,
    key TEXT NOT NULL,
    old_value_json TEXT,
    new_value_json TEXT NOT NULL,
    modality TEXT NOT NULL,
    changed_by TEXT,
    change_reason TEXT,
    changed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (being_id) REFERENCES ontology_beings(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_ontology_attr_hist_being ON ontology_attribute_history(being_id);
CREATE INDEX IF NOT EXISTS idx_ontology_attr_hist_key ON ontology_attribute_history(key);
CREATE INDEX IF NOT EXISTS idx_ontology_attr_hist_time ON ontology_attribute_history(changed_at);
  `);

  await db.exec(`
CREATE TABLE IF NOT EXISTS substance_records (
    id TEXT PRIMARY KEY,
    category TEXT NOT NULL CHECK (category IN ('primary', 'secondary', 'infinite', 'monad', 'cogitans', 'extensa')),
    agent_id TEXT,
    essence_hash TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_substance_records_category ON substance_records(category);

CREATE TABLE IF NOT EXISTS substance_modes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    mode_id TEXT NOT NULL,
    infinite_substance_id TEXT NOT NULL,
    attribute TEXT NOT NULL CHECK (attribute IN ('thought', 'extension')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_substance_modes_mode ON substance_modes(mode_id);
CREATE INDEX IF NOT EXISTS idx_substance_modes_infinite ON substance_modes(infinite_substance_id);

CREATE TABLE IF NOT EXISTS cartesian_unions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cogitans_id TEXT NOT NULL,
    extensa_id TEXT NOT NULL,
    union_type TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_cartesian_unions_cogitans ON cartesian_unions(cogitans_id);
CREATE INDEX IF NOT EXISTS idx_cartesian_unions_extensa ON cartesian_unions(extensa_id);
  `);

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

async function ensureOntologyColumns(db) {
  const agentColumns = new Set((await db.all('PRAGMA table_info(agents)')).map(c => c.name));
  if (!agentColumns.has('ontology_id')) {
    await db.exec('ALTER TABLE agents ADD COLUMN ontology_id TEXT');
    await db.exec('CREATE INDEX IF NOT EXISTS idx_agents_ontology ON agents(ontology_id)');
  }
}

module.exports = {
  createOntologyTables,
  ensureOntologyColumns
};