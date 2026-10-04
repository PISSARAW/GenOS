'use strict';

const { migrateDaemonScout } = require('../../../db/migrations/migrateDaemonScout');

function fromRow(row) {
  return {
    id: row.id, apiVersion: 'genos.daemon/v1', kind: 'ScoutColony',
    daemonId: row.daemon_id, territoryId: row.territory_id,
    observationGoal: row.observation_goal, partitionStrategy: row.partition_strategy,
    maxCells: row.max_cells, budget: row.budget, ttlMs: row.ttl_ms,
    llmRatio: row.llm_ratio, state: row.state, cellIds: JSON.parse(row.cell_ids || '[]'),
    findings: JSON.parse(row.findings || '[]'),
    createdAt: new Date(row.created_at).getTime(),
    expiresAt: new Date(row.expires_at).getTime(),
    dissolvedAt: row.dissolved_at ? new Date(row.dissolved_at).getTime() : undefined,
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
  return { swept: result?.changes || 0 };
}

module.exports = { persistColony, loadColonies, persistColonyUpdate, sweepScoutColonies };
