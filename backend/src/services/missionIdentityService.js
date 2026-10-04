'use strict';

const crypto = require('crypto');
const { withTransaction } = require('../db');

function newMissionId() {
  return `mission_${crypto.randomUUID()}`;
}

async function create(db, input = {}) {
  const missionId = input.missionId || newMissionId();
  await db.run(`INSERT OR IGNORE INTO missions
    (mission_id, objective, orchestrator_agent_id, status) VALUES (?, ?, ?, 'active')`,
  missionId, input.objective || 'GenOS mission', input.orchestratorAgentId || null);
  if (input.orchestratorAgentId) await attachAgent(db, { missionId, agentId: input.orchestratorAgentId, role: 'orchestrator' });
  return get(db, missionId);
}

async function attachAgent(db, input = {}) {
  const { missionId, agentId, role = null } = input;
  if (!missionId || !agentId) throw new Error('missionId and agentId are required.');
  await db.run(`INSERT OR IGNORE INTO mission_agents (mission_id, agent_id, role)
    VALUES (?, ?, ?)`, missionId, agentId, role);
  return db.get('SELECT mission_id AS missionId, agent_id AS agentId, role FROM mission_agents WHERE mission_id = ? AND agent_id = ?', missionId, agentId);
}

async function attachOrchestrator(db, input = {}) {
  const { missionId, agentId, expectedOrchestratorId } = input;
  return withTransaction(db, async () => {
    const current = await get(db, missionId);
    if (!current) throw new Error(`Mission '${missionId}' was not found.`);
    if (!['active', 'dormant'].includes(current.status)) {
      throw Object.assign(new Error('A terminal mission cannot acquire a new orchestrator.'), { code: 'MISSION_TERMINAL' });
    }
    if (current.orchestratorAgentId && current.orchestratorAgentId !== agentId
      && current.orchestratorAgentId !== expectedOrchestratorId) {
      throw Object.assign(new Error('Mission succession requires the current orchestrator identity.'), { code: 'MISSION_SUCCESSION_CONFLICT' });
    }
    const changed = await db.run(`UPDATE missions SET orchestrator_agent_id = ?, updated_at = CURRENT_TIMESTAMP
      WHERE mission_id = ? AND orchestrator_agent_id IS ?`, agentId, missionId, current.orchestratorAgentId);
    if (!changed.changes) {
      throw Object.assign(new Error('Mission orchestrator changed during succession.'), { code: 'MISSION_SUCCESSION_CONFLICT' });
    }
    await attachAgent(db, { missionId, agentId, role: 'orchestrator' });
    await require('./missionExecutionAuthority').rotate(db, {
      missionId, agentId, previousAgentId: current.orchestratorAgentId,
      forceRotate: current.status === 'dormant'
    });
    return get(db, missionId);
  });
}

async function get(db, missionId) {
  return db.get(`SELECT mission_id AS missionId, objective, status,
    orchestrator_agent_id AS orchestratorAgentId, created_at AS createdAt,
    updated_at AS updatedAt FROM missions WHERE mission_id = ?`, missionId);
}

async function members(db, missionId) {
  return db.all(`SELECT a.id, a.role, a.status, a.execution_mode
    FROM mission_agents ma JOIN agents a ON a.id = ma.agent_id
    WHERE ma.mission_id = ?`, missionId);
}

async function setStatus(db, missionId, status) {
  const allowed = new Set(['active', 'dormant', 'completed', 'failed', 'cancelled']);
  if (!allowed.has(status)) throw new Error(`Invalid mission status '${status}'.`);
  const transitions = { active: ['dormant', 'completed', 'failed', 'cancelled'], dormant: ['active', 'failed', 'cancelled'], completed: [], failed: [], cancelled: [] };
  const current = await get(db, missionId);
  if (!current) throw new Error(`Mission '${missionId}' was not found.`);
  if (current.status === status) return current;
  if (!transitions[current.status]?.includes(status)) {
    throw Object.assign(new Error(`Invalid mission transition ${current.status} -> ${status}.`), { code: 'MISSION_INVALID_TRANSITION' });
  }
  const changed = await db.run('UPDATE missions SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE mission_id = ? AND status = ?', status, missionId, current.status);
  if (changed.changes !== 1) throw Object.assign(new Error('Mission status changed concurrently.'), { code: 'MISSION_STATUS_CONFLICT' });
  return get(db, missionId);
}

module.exports = { newMissionId, create, attachAgent, attachOrchestrator, get, members, setStatus };
