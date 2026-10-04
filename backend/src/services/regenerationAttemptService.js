'use strict';
const { withTransaction } = require('../db');

async function ensureStorage(db) {
  await db.exec(`CREATE TABLE IF NOT EXISTS mission_regeneration_attempts (
    mission_id TEXT NOT NULL, lost_agent_id TEXT NOT NULL, replacement_id TEXT NOT NULL,
    role TEXT NOT NULL, status TEXT NOT NULL, evidence_ref TEXT, owner_pid INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (mission_id, lost_agent_id)
  )`);
  const columns = await db.all('PRAGMA table_info(mission_regeneration_attempts)');
  if (!columns.some(column => column.name === 'owner_pid')) await db.exec('ALTER TABLE mission_regeneration_attempts ADD COLUMN owner_pid INTEGER');
}

async function reserve(db, input) {
  await ensureStorage(db);
  if (!input.lostIdentifier) throw new Error('A lost worker identifier is required.');
  return withTransaction(db, async () => {
    const previous = await db.get(`SELECT * FROM mission_regeneration_attempts
      WHERE mission_id = ? AND lost_agent_id = ?`, input.missionId, input.lostIdentifier);
    if (previous) return recoverReservation(db, previous);
    const count = await db.get('SELECT COUNT(*) AS attempts FROM mission_regeneration_attempts WHERE mission_id = ?', input.missionId);
    if (count.attempts >= 3) return { reserved: false, reason: 'Mission regeneration limit reached.' };
    const result = await db.run(`INSERT OR IGNORE INTO mission_regeneration_attempts
      (mission_id, lost_agent_id, replacement_id, role, status, owner_pid)
      VALUES (?, ?, ?, ?, 'reserved', ?)`,
    input.missionId, input.lostIdentifier, input.replacementId, input.role, process.pid);
    return { reserved: result.changes === 1, replacementId: input.replacementId,
      reason: result.changes ? null : 'This lost worker already has a regeneration attempt.' };
  });
}

async function recoverReservation(db, previous) {
  if (previous.status !== 'reserved' || pidAlive(previous.owner_pid)) {
    return { reserved: false, reason: 'This lost worker already has a regeneration attempt.' };
  }
  const worker = await db.get('SELECT runtime_pid FROM agents WHERE id = ?', previous.replacement_id);
  if (pidAlive(worker?.runtime_pid)) return { reserved: false, reason: 'Replacement worker is still running.' };
  await db.run(`UPDATE mission_regeneration_attempts SET owner_pid = ?, updated_at = CURRENT_TIMESTAMP
    WHERE mission_id = ? AND lost_agent_id = ? AND status = 'reserved'`,
  process.pid, previous.mission_id, previous.lost_agent_id);
  return { reserved: true, replacementId: previous.replacement_id, recovered: true };
}

function pidAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; } catch (error) { return error.code === 'EPERM'; }
}

async function mark(db, input) {
  await db.run(`UPDATE mission_regeneration_attempts SET status = ?, evidence_ref = ?, owner_pid = NULL,
    updated_at = CURRENT_TIMESTAMP WHERE mission_id = ? AND lost_agent_id = ? AND replacement_id = ?`,
  input.status, input.evidenceRef || null, input.missionId, input.lostIdentifier, input.replacementId);
}

async function effectiveAgents(db, missionId, agents) {
  await ensureStorage(db);
  const mission = await require('./missionIdentityService').get(db, missionId);
  const verified = await db.all(`SELECT lost_agent_id, replacement_id FROM mission_regeneration_attempts
    WHERE mission_id = ? AND status = 'verified'`, missionId);
  const lost = new Set(verified.map(row => row.lost_agent_id));
  const replacements = new Set(verified.map(row => row.replacement_id));
  return agents.filter(agent => !lost.has(agent.id)
    && (agent.execution_mode !== 'orchestrator' || agent.id === mission?.orchestratorAgentId)).map(agent =>
    replacements.has(agent.id) && agent.status === 'idle' ? { ...agent, status: 'completed' } : agent);
}

module.exports = { reserve, mark, effectiveAgents };
