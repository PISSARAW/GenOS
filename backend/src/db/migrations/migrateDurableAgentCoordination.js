'use strict';

async function migrateDurableAgentCoordination(db) {
  await db.exec(`CREATE TABLE IF NOT EXISTS agent_relations (
    id TEXT PRIMARY KEY, source_agent_id TEXT NOT NULL, target_agent_id TEXT NOT NULL,
    relation_type TEXT NOT NULL, relation_class TEXT,
    metadata_json TEXT NOT NULL DEFAULT '{}',
    familiarity REAL NOT NULL DEFAULT 0, interaction_count INTEGER NOT NULL DEFAULT 0,
    shared_history REAL NOT NULL DEFAULT 0, authority REAL NOT NULL DEFAULT 0,
    trust_for_domain REAL NOT NULL DEFAULT 0, common_ground_estimate REAL NOT NULL DEFAULT 0,
    epistemic_independence REAL NOT NULL DEFAULT 1, error_correlation REAL NOT NULL DEFAULT 0,
    disclosure_level REAL NOT NULL DEFAULT 1, preferred_dialect TEXT,
    last_interaction TEXT,
    organization_id TEXT, project_id TEXT, provenance_hash TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    CHECK (json_valid(metadata_json)), CHECK (source_agent_id <> target_agent_id)
  );
  CREATE INDEX IF NOT EXISTS idx_agent_relations_source ON agent_relations(source_agent_id, relation_type);
  CREATE INDEX IF NOT EXISTS idx_agent_relations_target ON agent_relations(target_agent_id, relation_type);
  CREATE INDEX IF NOT EXISTS idx_agent_relations_scope ON agent_relations(organization_id, project_id);
  CREATE INDEX IF NOT EXISTS idx_agent_relations_class ON agent_relations(relation_class);
  CREATE INDEX IF NOT EXISTS idx_agent_relations_familiarity ON agent_relations(familiarity);
  CREATE INDEX IF NOT EXISTS idx_agent_relations_epistemic ON agent_relations(epistemic_independence);

  CREATE TABLE IF NOT EXISTS collective_decisions (
    id TEXT PRIMARY KEY, topic TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'open',
    proposal_json TEXT NOT NULL DEFAULT '{}', result_json TEXT,
    quorum INTEGER NOT NULL DEFAULT 1, expires_at DATETIME,
    organization_id TEXT, project_id TEXT, created_by TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP, resolved_at DATETIME,
    CHECK (status IN ('open', 'accepted', 'rejected', 'expired', 'escalated')),
    CHECK (json_valid(proposal_json)), CHECK (result_json IS NULL OR json_valid(result_json))
  );
  CREATE INDEX IF NOT EXISTS idx_collective_decisions_queue ON collective_decisions(status, expires_at);
  CREATE INDEX IF NOT EXISTS idx_collective_decisions_scope ON collective_decisions(organization_id, project_id);

  CREATE TABLE IF NOT EXISTS collective_decision_votes (
    decision_id TEXT NOT NULL, voter_agent_id TEXT NOT NULL, vote TEXT NOT NULL,
    evidence_json TEXT NOT NULL DEFAULT '{}', created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (decision_id, voter_agent_id),
    CHECK (vote IN ('approve', 'reject', 'abstain')), CHECK (json_valid(evidence_json))
  );

  CREATE TABLE IF NOT EXISTS continuation_queue (
    id TEXT PRIMARY KEY, agent_id TEXT NOT NULL, orchestrator_id TEXT,
    mission_json TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending',
    available_at DATETIME DEFAULT CURRENT_TIMESTAMP, attempts INTEGER NOT NULL DEFAULT 0,
    organization_id TEXT, project_id TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    CHECK (status IN ('pending', 'dispatched', 'completed', 'failed', 'cancelled')),
    CHECK (json_valid(mission_json))
  );
  CREATE INDEX IF NOT EXISTS idx_continuation_queue_ready ON continuation_queue(status, available_at);
  CREATE INDEX IF NOT EXISTS idx_continuation_queue_scope ON continuation_queue(organization_id, project_id);

  CREATE TABLE IF NOT EXISTS survival_wake_conditions (
    id TEXT PRIMARY KEY, agent_id TEXT NOT NULL, condition_json TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'armed', triggered_at DATETIME,
    organization_id TEXT, project_id TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    CHECK (status IN ('armed', 'triggered', 'cancelled')), CHECK (json_valid(condition_json))
  );
  CREATE INDEX IF NOT EXISTS idx_survival_wake_conditions_agent ON survival_wake_conditions(agent_id, status);
`);
  const wakeColumns = await db.all('PRAGMA table_info(survival_wake_conditions)');
  if (wakeColumns.length && !wakeColumns.some((column) => column.name === 'snapshot_id')) {
    await db.exec('ALTER TABLE survival_wake_conditions ADD COLUMN snapshot_id TEXT');
  }
}

module.exports = { migrateDurableAgentCoordination };
