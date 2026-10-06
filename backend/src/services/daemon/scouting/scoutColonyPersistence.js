'use strict';

const { migrateDaemonScout } = require('../../../db/migrations/migrateDaemonScout');

function utcTime(value) {
  const normalized = String(value || '').replace(' ', 'T');
  return Date.parse(/(?:Z|[+-]\d{2}:\d{2})$/.test(normalized) ? normalized : normalized + 'Z');
}

async function getColony(db, id) {
  const row = await db.get('SELECT * FROM daemon_scout_colonies WHERE id = ?', id);
  return row ? fromRow(row) : null;
}

async function loadCells(db) {
  if (!db) return [];
  await migrateDaemonScout(db);
  const rows = await db.all('SELECT cells.* FROM daemon_scout_cells cells JOIN daemon_scout_colonies colonies ON cells.colony_id = colonies.id WHERE colonies.state != ?', 'DISSOLVED');
  return rows.map((row) => ({ id: row.id, colonyId: row.colony_id, territoryId: row.territory_id,
    goal: row.goal, state: row.state, headSha: row.head_sha, findings: JSON.parse(row.findings),
    provenanceRecordIds: JSON.parse(row.provenance_record_ids), tokensUsed: row.tokens_used,
    analysisType: row.analysis_type, completedAt: utcTime(row.completed_at) }));
}

function fromRow(row) {
  return {
    id: row.id, apiVersion: 'genos.daemon/v1', kind: 'ScoutColony',
    daemonId: row.daemon_id, territoryId: row.territory_id,
    observationGoal: row.observation_goal, partitionStrategy: row.partition_strategy,
    maxCells: row.max_cells, budget: row.budget, ttlMs: row.ttl_ms,
    llmRatio: row.llm_ratio, state: row.state, cellIds: JSON.parse(row.cell_ids || '[]'),
    findings: JSON.parse(row.findings || '[]'),
    createdAt: utcTime(row.created_at),
    expiresAt: utcTime(row.expires_at),
    dissolvedAt: row.dissolved_at ? utcTime(row.dissolved_at) : undefined,
    dissolveReason: row.dissolve_reason
  };
}

async function persistColony(db, colony) {
  await migrateDaemonScout(db);
  await db.run(
    `INSERT INTO daemon_scout_colonies (id, daemon_id, territory_id, observation_goal, partition_strategy, max_cells, budget, ttl_ms, llm_ratio, state, cell_ids, findings, created_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime(?), datetime(?))`,
    colony.id, colony.daemonId, colony.territoryId, colony.observationGoal, colony.partitionStrategy,
    colony.maxCells, colony.budget, colony.ttlMs, colony.llmRatio, colony.state,
    JSON.stringify(colony.cellIds || []), JSON.stringify(colony.findings || []),
    new Date(colony.createdAt).toISOString(), new Date(colony.expiresAt).toISOString()
  );
  return colony;
}

async function loadColonies(db) {
  if (!db) return [];
  await migrateDaemonScout(db);
  const rows = await db.all('SELECT * FROM daemon_scout_colonies WHERE state != ?', 'DISSOLVED');
  return (rows || []).map(fromRow);
}

async function persistColonyUpdate(db, colony) {
  await migrateDaemonScout(db);
  await db.run(
    `UPDATE daemon_scout_colonies SET state = ?, cell_ids = ?, findings = ?, dissolved_at = ?, dissolve_reason = ? WHERE id = ?`,
    colony.state, JSON.stringify(colony.cellIds || []), JSON.stringify(colony.findings || []),
    colony.dissolvedAt ? new Date(colony.dissolvedAt).toISOString() : null,
    colony.dissolveReason || null, colony.id
  );
}

async function sweepScoutColonies(db) {
  if (!db) return { swept: 0 };
  await migrateDaemonScout(db);
  const now = new Date().toISOString();
  const result = await db.run(
    `UPDATE daemon_scout_colonies SET state = 'DISSOLVED', dissolved_at = datetime(?), dissolve_reason = 'ttl-expired'
     WHERE state != 'DISSOLVED' AND datetime(expires_at) <= datetime(?)`, now, now
  );
  await db.run("UPDATE daemon_scout_cells SET state = 'EXHAUSTED', completed_at = datetime('now') WHERE state NOT IN ('COMPLETE', 'EXHAUSTED') AND colony_id IN (SELECT id FROM daemon_scout_colonies WHERE state = 'DISSOLVED')");
  return { swept: result?.changes || 0 };
}

module.exports = { getColony, loadCells, persistColony, loadColonies, persistColonyUpdate, sweepScoutColonies };
