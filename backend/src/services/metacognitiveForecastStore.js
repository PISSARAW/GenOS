'use strict';

const TABLE = 'metacognitive_forecasts';

async function ensure(db) {
  await db.exec(`CREATE TABLE IF NOT EXISTS ${TABLE} (
    run_id TEXT PRIMARY KEY, agent_id TEXT NOT NULL, organization_id TEXT, project_id TEXT,
    forecast_json TEXT NOT NULL, forecast_hash TEXT NOT NULL,
    resolution_json TEXT, resolution_hash TEXT, created_at TEXT NOT NULL,
    resolved_at TEXT
  ); CREATE INDEX IF NOT EXISTS idx_metacognitive_forecast_agent
    ON ${TABLE}(agent_id,organization_id,project_id,created_at);`);
}

async function scope(db, agentId) {
  const row = await db.get(`SELECT a.id AS agentId, w.organization_id AS organizationId,
    w.project_id AS projectId FROM agents a LEFT JOIN workspaces w ON w.id=a.workspace_id
    WHERE a.id=?`, agentId);
  if (!row || Boolean(row.organizationId) !== Boolean(row.projectId)) return null;
  return { agentId, organizationId: row.organizationId || null, projectId: row.projectId || null };
}

async function insert(db, forecast, hash) {
  return db.run(`INSERT OR IGNORE INTO ${TABLE}
    (run_id,agent_id,organization_id,project_id,forecast_json,forecast_hash,created_at)
    VALUES (?,?,?,?,?,?,?)`, forecast.runId, forecast.agentId, forecast.organizationId,
  forecast.projectId, JSON.stringify(forecast), hash, forecast.createdAt);
}

async function read(db, runId) {
  return db.get(`SELECT * FROM ${TABLE} WHERE run_id=?`, runId);
}

async function resolve(db, record) {
  return db.run(`UPDATE ${TABLE} SET resolution_json=?,resolution_hash=?,resolved_at=?
    WHERE run_id=? AND resolution_json IS NULL`, JSON.stringify(record.resolution), record.hash,
  record.resolution.observedAt, record.runId);
}

async function list(db, binding) {
  return db.all(`SELECT * FROM ${TABLE} WHERE agent_id=? AND organization_id IS ?
    AND project_id IS ? ORDER BY created_at DESC,run_id LIMIT 2000`,
  binding.agentId, binding.organizationId, binding.projectId);
}

module.exports = { ensure, scope, insert, read, resolve, list };
