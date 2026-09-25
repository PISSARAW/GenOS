'use strict';

const RELATION_COLUMNS_FLOAT = new Set([
  'familiarity', 'shared_history', 'interaction_count', 'authority',
  'common_ground_estimate', 'epistemic_independence', 'error_correlation',
  'disclosure_level'
]);

async function ensureColumn(ctx) {
  const { db, table, column, sqlType } = ctx;
  const existing = await db.all(`PRAGMA table_info(${table})`);
  if (!existing.some(c => c.name === column)) {
    await db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${sqlType}`);
  }
}

function ensureColumnTyped(db, table, column) {
  if (RELATION_COLUMNS_FLOAT.has(column)) {
    return ensureColumn({ db, table, column, sqlType: 'REAL NOT NULL DEFAULT 0' });
  }
  if (column === 'updated_at') {
    return ensureColumn({ db, table, column, sqlType: 'DATETIME DEFAULT CURRENT_TIMESTAMP' });
  }
  return ensureColumn({ db, table, column, sqlType: 'TEXT' });
}

async function createAgentRelations(db) {
  await db.exec(`CREATE TABLE IF NOT EXISTS agent_relations (
    id TEXT PRIMARY KEY, source_agent_id TEXT NOT NULL, target_agent_id TEXT NOT NULL,
    relation_type TEXT NOT NULL DEFAULT 'peer', familiarity REAL NOT NULL DEFAULT 0,
    interaction_count REAL NOT NULL DEFAULT 0, shared_history REAL NOT NULL DEFAULT 0,
    authority REAL NOT NULL DEFAULT 0, trust_for_domain TEXT,
    common_ground_estimate REAL NOT NULL DEFAULT 0, epistemic_independence REAL NOT NULL DEFAULT 0,
    error_correlation REAL NOT NULL DEFAULT 0, disclosure_level REAL NOT NULL DEFAULT 0,
    preferred_dialect TEXT, last_interaction DATETIME, organization_id TEXT, project_id TEXT,
    provenance_hash TEXT, relation_class TEXT, metadata_json TEXT NOT NULL DEFAULT '{}',
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(source_agent_id) REFERENCES agents(id) ON DELETE CASCADE,
    FOREIGN KEY(target_agent_id) REFERENCES agents(id) ON DELETE CASCADE
  )`);
}

async function enrichAgentRelations(db) {
  const existing = await db.all("SELECT name FROM sqlite_master WHERE type='table' AND name='agent_relations'");
  if (!existing.length) await createAgentRelations(db);
  await ensureColumn({ db, table: 'agent_relations', column: 'relation_class', sqlType: 'TEXT' });
  await ensureColumn({ db, table: 'agent_relations', column: 'metadata_json', sqlType: "TEXT NOT NULL DEFAULT '{}'" });
  for (const col of ['familiarity', 'interaction_count', 'shared_history', 'authority',
    'trust_for_domain', 'common_ground_estimate', 'epistemic_independence', 'error_correlation',
    'disclosure_level', 'preferred_dialect', 'last_interaction', 'organization_id', 'project_id',
    'provenance_hash', 'updated_at']) {
    await ensureColumnTyped(db, 'agent_relations', col);
  }
}

async function ensureIndex(ctx) {
  const { db, table, indexName, columns } = ctx;
  const existing = await db.all("SELECT name FROM sqlite_master WHERE type='index' AND name=?", [indexName]);
  if (!existing.length) await db.exec(`CREATE INDEX IF NOT EXISTS ${indexName} ON ${table}(${columns})`);
}

async function ensureIndexIfCol(ctx) {
  const { db, table, indexName, column } = ctx;
  const cols = await db.all(`PRAGMA table_info(${table})`);
  if (cols.some(c => c.name === column)) {
    await ensureIndex({ db, table, indexName, columns: column });
  }
}

async function indexAgentRelations(db) {
  await ensureIndex({ db, table: 'agent_relations', indexName: 'idx_agent_relations_source', columns: 'source_agent_id, relation_type' });
  await ensureIndex({ db, table: 'agent_relations', indexName: 'idx_agent_relations_target', columns: 'target_agent_id, relation_type' });
  await ensureIndex({ db, table: 'agent_relations', indexName: 'idx_agent_relations_scope', columns: 'organization_id, project_id' });
  await ensureIndexIfCol({ db, table: 'agent_relations', indexName: 'idx_agent_relations_class', column: 'relation_class' });
  await ensureIndexIfCol({ db, table: 'agent_relations', indexName: 'idx_agent_relations_familiarity', column: 'familiarity' });
  await ensureIndexIfCol({ db, table: 'agent_relations', indexName: 'idx_agent_relations_epistemic', column: 'epistemic_independence' });
}

const COLLECTIVE_DECISIONS = `CREATE TABLE IF NOT EXISTS collective_decisions (
  id TEXT PRIMARY KEY, topic TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'open',
  proposal_json TEXT NOT NULL DEFAULT '{}', result_json TEXT,
  quorum INTEGER NOT NULL DEFAULT 1, expires_at DATETIME,
  organization_id TEXT, project_id TEXT, created_by TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP, resolved_at DATETIME,
  CHECK (status IN ('open', 'accepted', 'rejected', 'expired', 'escalated')),
  CHECK (json_valid(proposal_json)), CHECK (result_json IS NULL OR json_valid(result_json))
)`;

const COLLECTIVE_VOTES = `CREATE TABLE IF NOT EXISTS collective_decision_votes (
  decision_id TEXT NOT NULL, voter_agent_id TEXT NOT NULL, vote TEXT NOT NULL,
  evidence_json TEXT NOT NULL DEFAULT '{}', created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (decision_id, voter_agent_id),
  CHECK (vote IN ('approve', 'reject', 'abstain')), CHECK (json_valid(evidence_json))
)`;

const CONTINUATION_QUEUE = `CREATE TABLE IF NOT EXISTS continuation_queue (
  id TEXT PRIMARY KEY, agent_id TEXT NOT NULL, orchestrator_id TEXT,
  mission_json TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending',
  available_at DATETIME DEFAULT CURRENT_TIMESTAMP, attempts INTEGER NOT NULL DEFAULT 0,
  organization_id TEXT, project_id TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  CHECK (status IN ('pending', 'dispatched', 'completed', 'failed', 'cancelled')),
  CHECK (json_valid(mission_json))
)`;

const SURVIVAL_WAKE = `CREATE TABLE IF NOT EXISTS survival_wake_conditions (
  id TEXT PRIMARY KEY, agent_id TEXT NOT NULL, condition_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'armed', triggered_at DATETIME,
  organization_id TEXT, project_id TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  CHECK (status IN ('armed', 'triggered', 'cancelled')), CHECK (json_valid(condition_json))
)`;

async function createTableIfMissing(ctx) {
  const { db, table, sql, post } = ctx;
  const cols = await db.all(`PRAGMA table_info(${table})`);
  if (!cols.length) {
    await db.exec(sql);
    if (post) for (const idx of post) await db.exec(idx);
  }
}

async function migrateCollectiveDecisions(db) {
  await createTableIfMissing({
    db, table: 'collective_decisions', sql: COLLECTIVE_DECISIONS,
    post: [
      'CREATE INDEX IF NOT EXISTS idx_collective_decisions_queue ON collective_decisions(status, expires_at)',
      'CREATE INDEX IF NOT EXISTS idx_collective_decisions_scope ON collective_decisions(organization_id, project_id)'
    ]
  });
}

async function migrateContinuationQueue(db) {
  await createTableIfMissing({
    db, table: 'continuation_queue', sql: CONTINUATION_QUEUE,
    post: [
      'CREATE INDEX IF NOT EXISTS idx_continuation_queue_ready ON continuation_queue(status, available_at)',
      'CREATE INDEX IF NOT EXISTS idx_continuation_queue_scope ON continuation_queue(organization_id, project_id)'
    ]
  });
}

async function migrateSurvivalWake(db) {
  const cols = await db.all('PRAGMA table_info(survival_wake_conditions)');
  if (!cols.length) {
    await db.exec(SURVIVAL_WAKE);
    await db.exec('CREATE INDEX IF NOT EXISTS idx_survival_wake_conditions_agent ON survival_wake_conditions(agent_id, status)');
  } else if (!cols.some(c => c.name === 'snapshot_id')) {
    await db.exec('ALTER TABLE survival_wake_conditions ADD COLUMN snapshot_id TEXT');
  }
}

async function migrateDurableAgentCoordination(db) {
  await enrichAgentRelations(db);
  await indexAgentRelations(db);
  await migrateCollectiveDecisions(db);
  await createTableIfMissing({ db, table: 'collective_decision_votes', sql: COLLECTIVE_VOTES });
  await migrateContinuationQueue(db);
  await migrateSurvivalWake(db);
}

module.exports = { migrateDurableAgentCoordination };
