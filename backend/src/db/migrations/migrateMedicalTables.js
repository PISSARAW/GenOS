'use strict';

async function migrateMedicalTables(db) {
  await db.exec(`CREATE TABLE IF NOT EXISTS clinical_states (
    id TEXT PRIMARY KEY,
    agent_id TEXT NOT NULL UNIQUE,
    vitals_json TEXT NOT NULL DEFAULT '{}',
    immune_titer REAL NOT NULL DEFAULT 1.0,
    inflammatory_index REAL NOT NULL DEFAULT 0.0,
    cell_cycle_state TEXT NOT NULL DEFAULT 'G0' CHECK (cell_cycle_state IN ('G0','G1','S','G2','M','arrested','senescent')),
    plasmid_load REAL NOT NULL DEFAULT 0.0,
    pathogen_burden REAL NOT NULL DEFAULT 0.0,
    iatrogenic_load REAL NOT NULL DEFAULT 0.0,
    wellness_score REAL NOT NULL DEFAULT 1.0,
    observed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_clinical_states_wellness ON clinical_states(wellness_score);
  CREATE INDEX IF NOT EXISTS idx_clinical_states_agent ON clinical_states(agent_id);
  `);

  await db.exec(`CREATE TABLE IF NOT EXISTS pathologies (
    id TEXT PRIMARY KEY,
    agent_id TEXT NOT NULL,
    clinical_state_id TEXT NOT NULL,
    pathology_type TEXT NOT NULL CHECK (pathology_type IN ('mutation_drift','plasmid_overload','immune_exhaustion','iatrogenic_toxicity','cell_cycle_malignancy','cognitive_metastasis','inflammatory_cytokine_storm','quarantine_breach','senescence_escape')),
    severity REAL NOT NULL DEFAULT 0.0,
    confidence REAL NOT NULL DEFAULT 0.5,
    evidence_json TEXT NOT NULL DEFAULT '[]',
    biopsy_ref TEXT,
    status TEXT NOT NULL DEFAULT 'suspected' CHECK (status IN ('suspected','biopsied','confirmed','remission','resolved','chronic')),
    detected_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    resolved_at DATETIME,
    FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE,
    FOREIGN KEY (clinical_state_id) REFERENCES clinical_states(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_pathologies_agent_status ON pathologies(agent_id, status);
  CREATE INDEX IF NOT EXISTS idx_pathologies_type ON pathologies(pathology_type);
  `);

  await db.exec(`CREATE TABLE IF NOT EXISTS treatments (
    id TEXT PRIMARY KEY,
    agent_id TEXT NOT NULL,
    pathology_id TEXT,
    clinical_state_id TEXT NOT NULL,
    therapy_type TEXT NOT NULL CHECK (therapy_type IN ('cell_cycle_inhibition','plasmid_suppression','quarantine','immune_stimulation','apoptosis_induction','senolytic','epigenetic_reset','supportive_care','watchful_waiting')),
    dosage REAL NOT NULL DEFAULT 1.0,
    iatrogenic_risk REAL NOT NULL DEFAULT 0.0,
    iatrogenic_manifestations_json TEXT NOT NULL DEFAULT '[]',
    efficacy_score REAL,
    status TEXT NOT NULL DEFAULT 'prescribed' CHECK (status IN ('prescribed','active','completed','discontinued','contraindicated')),
    prescribed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    completed_at DATETIME,
    FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE,
    FOREIGN KEY (pathology_id) REFERENCES pathologies(id) ON DELETE SET NULL,
    FOREIGN KEY (clinical_state_id) REFERENCES clinical_states(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_treatments_agent_status ON treatments(agent_id, status);
  CREATE INDEX IF NOT EXISTS idx_treatments_pathology ON treatments(pathology_id);
  `);

  await db.exec(`CREATE TABLE IF NOT EXISTS immune_events (
    id TEXT PRIMARY KEY,
    agent_id TEXT NOT NULL,
    clinical_state_id TEXT NOT NULL,
    event_type TEXT NOT NULL CHECK (event_type IN ('surveillance_scan','anomaly_detected','quarantine_initiated','biopsy_collected','diagnosis_rendered','therapy_initiated','therapy_completed','iatrogenic_event','pathogen_cleared','relapse','memory_enrollment')),
    event_json TEXT NOT NULL DEFAULT '{}',
    severity TEXT NOT NULL DEFAULT 'info' CHECK (severity IN ('debug','info','warning','error','critical')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE,
    FOREIGN KEY (clinical_state_id) REFERENCES clinical_states(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_immune_events_agent_time ON immune_events(agent_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_immune_events_type ON immune_events(event_type);
  `);
}

module.exports = { migrateMedicalTables };
