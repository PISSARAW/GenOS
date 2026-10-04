'use strict';

const crypto = require('crypto');
const { getDatabase } = require('../db');

function wakeId() {
  return `wake_${crypto.randomUUID()}`;
}

async function ensureStorage(db) {
  await db.exec(`CREATE TABLE IF NOT EXISTS survival_wake_conditions (
    id TEXT PRIMARY KEY, agent_id TEXT NOT NULL, condition_json TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'armed', triggered_at DATETIME, snapshot_id TEXT, owner_pid INTEGER, mission_id TEXT,
    organization_id TEXT, project_id TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  CHECK (status IN ('armed', 'triggered', 'cancelled')), CHECK (json_valid(condition_json))
  );
  CREATE INDEX IF NOT EXISTS idx_survival_wake_conditions_agent ON survival_wake_conditions(agent_id, status);`);
  const columns = await db.all('PRAGMA table_info(survival_wake_conditions)');
  await addColumn(db, columns, { name: 'snapshot_id', type: 'TEXT' });
  await addColumn(db, columns, { name: 'owner_pid', type: 'INTEGER' });
  await addColumn(db, columns, { name: 'mission_id', type: 'TEXT' });
  await db.run(`UPDATE survival_wake_conditions SET mission_id =
    (SELECT json_extract(s.state_json, '$.missionId') FROM cryptobiosis_snapshots s
     WHERE s.snapshot_id = survival_wake_conditions.snapshot_id AND json_valid(s.state_json))
    WHERE mission_id IS NULL AND snapshot_id IS NOT NULL`);
}

async function addColumn(db, columns, spec) {
  const { name, type } = spec;
  if (columns.some(column => column.name === name)) return;
  try { await db.exec(`ALTER TABLE survival_wake_conditions ADD COLUMN ${name} ${type}`); }
  catch (error) { if (!/duplicate column name/i.test(error.message)) throw error; }
}

async function arm(input = {}) {
  const db = input.db || await getDatabase();
  await ensureStorage(db);
  const id = input.id || wakeId();
  const condition = normalizeCondition(input.condition);
  if (['budget_added', 'budget_restored', 'provider_available', 'human_resolves_gate', 'external_event'].includes(condition.type)
    && !input.missionId) {
    throw Object.assign(new Error('A mission ID is required for a registry-backed wake.'), { code: 'WAKE_CONDITION_INVALID' });
  }
  await db.run(
    `INSERT INTO survival_wake_conditions
      (id, agent_id, condition_json, organization_id, project_id, snapshot_id, mission_id)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [id, input.agentId, JSON.stringify(condition), input.organizationId || null, input.projectId || null, input.snapshotId || null, input.missionId || null]
  );
  return get({ id, db });
}

function normalizeCondition(input) {
  const condition = input && typeof input === 'object' ? input : {};
  const type = condition.type || condition.kind;
  const allowed = new Set(['operator_or_signal', 'budget_added', 'budget_restored', 'provider_available',
    'human_resolves_gate', 'external_event', 'time_elapsed']);
  if (!allowed.has(type)) throw Object.assign(new Error('Unsupported wake condition.'), { code: 'WAKE_CONDITION_INVALID' });
  const normalized = { ...condition, ...(condition.payload || {}), type };
  validateWakeFields(normalized);
  return normalized;
}

function validateWakeFields(condition) {
  validateTime(condition);
  validateBudget(condition);
  validateRequiredKey(condition);
}

function validateTime(condition) {
  const type = condition.type;
  if (type === 'time_elapsed' && !Number.isFinite(Date.parse(condition.dueAt || condition.at || ''))) {
    throw Object.assign(new Error('A valid dueAt is required for a timed wake.'), { code: 'WAKE_CONDITION_INVALID' });
  }
}

function validateBudget(condition) {
  const type = condition.type;
  if (['budget_added', 'budget_restored'].includes(type)
    && (!Number.isSafeInteger(condition.minimumTokens) || condition.minimumTokens < 1)) {
    throw Object.assign(new Error('A positive minimumTokens is required for a budget wake.'), { code: 'WAKE_CONDITION_INVALID' });
  }
}

function validateRequiredKey(condition) {
  const type = condition.type;
  const requiredKeys = { provider_available: 'providerId', human_resolves_gate: 'gateId', external_event: 'eventName' };
  const required = requiredKeys[type];
  if (required && (typeof condition[required] !== 'string' || !condition[required].trim())) {
    throw Object.assign(new Error(`${required} is required for this wake condition.`), { code: 'WAKE_CONDITION_INVALID' });
  }
}

async function listDue(db, now = new Date()) {
  await ensureStorage(db);
  const rows = await db.all("SELECT * FROM survival_wake_conditions WHERE status = 'armed' ORDER BY created_at");
  return rows.map(format).filter(row => row.condition.type === 'time_elapsed'
    && Date.parse(row.condition.dueAt || row.condition.at || '') <= now.getTime());
}

async function listRegistryArmed(db) {
  await ensureStorage(db);
  const rows = await db.all("SELECT * FROM survival_wake_conditions WHERE status = 'armed' AND mission_id IS NOT NULL ORDER BY created_at");
  return rows.map(format).filter(row => ['budget_added', 'budget_restored', 'provider_available',
    'human_resolves_gate', 'external_event'].includes(row.condition.type));
}

async function get(input = {}) {
  const db = input.db || await getDatabase();
  await ensureStorage(db);
  const row = await db.get('SELECT * FROM survival_wake_conditions WHERE id = ?', input.id);
  return row ? format(row) : null;
}

async function listArmed(input = {}) {
  const db = input.db || await getDatabase();
  await ensureStorage(db);
  const rows = await db.all(
    `SELECT * FROM survival_wake_conditions WHERE agent_id = ? AND status = 'armed' ORDER BY created_at ASC`,
    input.agentId
  );
  return rows.map(format);
}

async function trigger(input = {}) {
  const db = input.db || await getDatabase();
  await ensureStorage(db);
  const result = await db.run(
    `UPDATE survival_wake_conditions
     SET status = 'triggered', triggered_at = CURRENT_TIMESTAMP, owner_pid = ?
     WHERE id = ? AND status = 'armed'`, process.pid, input.id
  );
  return { claimed: result.changes === 1, condition: await get({ id: input.id, db }) };
}

async function rearm(input = {}) {
  const db = input.db || await getDatabase();
  await ensureStorage(db);
  await db.run(`UPDATE survival_wake_conditions
    SET status = 'armed', triggered_at = NULL, owner_pid = NULL
    WHERE id = ? AND status = 'triggered'`, input.id);
  return get({ id: input.id, db });
}

async function abandoned(db) {
  await ensureStorage(db);
  const rows = await db.all("SELECT * FROM survival_wake_conditions WHERE status = 'triggered'");
  return rows.map(format).filter(row => !pidAlive(row.ownerPid));
}

function pidAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; } catch (error) { return error.code === 'EPERM'; }
}

async function cancel(input = {}) {
  const db = input.db || await getDatabase();
  await ensureStorage(db);
  await db.run("UPDATE survival_wake_conditions SET status = 'cancelled' WHERE id = ? AND status = 'armed'", input.id);
  return get({ id: input.id, db });
}

function format(row) {
  return {
    id: row.id, agentId: row.agent_id, status: row.status,
    condition: JSON.parse(row.condition_json || '{}'), snapshotId: row.snapshot_id, missionId: row.mission_id,
    organizationId: row.organization_id,
    projectId: row.project_id, createdAt: row.created_at, triggeredAt: row.triggered_at,
    ownerPid: row.owner_pid
  };
}

module.exports = { arm, get, listArmed, listDue, listRegistryArmed, abandoned, trigger, rearm, cancel, ensureStorage };
