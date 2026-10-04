'use strict';
const { randomUUID } = require('node:crypto');

async function ensureTable(db) {
  await db.exec(`CREATE TABLE IF NOT EXISTS mission_execution_authority (
    mission_id TEXT PRIMARY KEY, agent_id TEXT NOT NULL, generation INTEGER NOT NULL,
    token TEXT NOT NULL, state TEXT NOT NULL CHECK(state IN ('reserved','launching','running','failed')),
    owner_pid INTEGER, claimed_at DATETIME
  )`);
  const columns = await db.all('PRAGMA table_info(mission_execution_authority)');
  await addColumn(db, columns, { name: 'owner_pid', type: 'INTEGER' });
  await addColumn(db, columns, { name: 'claimed_at', type: 'DATETIME' });
}
async function addColumn(db, columns, spec) {
  const { name, type } = spec;
  if (columns.some(column => column.name === name)) return;
  try { await db.exec(`ALTER TABLE mission_execution_authority ADD COLUMN ${name} ${type}`); }
  catch (error) { if (!/duplicate column name/i.test(error.message)) throw error; }
}
function conflict() {
  return Object.assign(new Error('Mission execution authority is stale'), { code: 'MISSION_AUTHORITY_STALE' });
}
async function rotate(db, input) {
  await ensureTable(db);
  const current = await db.get('SELECT * FROM mission_execution_authority WHERE mission_id=?', input.missionId);
  if (reusableAuthority(current, input)) return current;
  await db.run(`INSERT INTO mission_execution_authority (mission_id,agent_id,generation,token,state)
    VALUES (?,?,?,?,'reserved') ON CONFLICT(mission_id) DO UPDATE SET
    agent_id=excluded.agent_id,generation=excluded.generation,token=excluded.token,
    state='reserved',owner_pid=NULL,claimed_at=NULL`,
  input.missionId,input.agentId,(current?.generation || 0)+1,randomUUID());
  return db.get('SELECT * FROM mission_execution_authority WHERE mission_id=?', input.missionId);
}
async function reserve(db, input) {
  await require('./missionIdentityService').attachOrchestrator(db, input);
  return db.get('SELECT * FROM mission_execution_authority WHERE mission_id=?', input.missionId);
}
async function claimLaunch(db, lease) {
  const changed = await db.run("UPDATE mission_execution_authority SET state='launching',owner_pid=?,claimed_at=CURRENT_TIMESTAMP WHERE mission_id=? AND token=? AND state='reserved'",
    process.pid,lease.mission_id,lease.token);
  if (changed.changes !== 1) throw conflict();
}
function reusableAuthority(current, input) {
  if (current?.agent_id !== input.agentId || input.previousAgentId !== input.agentId) return false;
  return current.state === 'reserved' || isOwnerLive(current);
}
function isOwnerLive(lease) {
  if (!['launching', 'running'].includes(lease.state) || !Number.isInteger(lease.owner_pid) || lease.owner_pid <= 0) return false;
  try { process.kill(lease.owner_pid, 0); return true; } catch (error) { return error.code === 'EPERM'; }
}
async function assertAuthority(db, authority) {
  if (!authority) return;
  await ensureTable(db);
  const current = await db.get('SELECT * FROM mission_execution_authority WHERE mission_id=?', authority.mission_id);
  if (!current || current.agent_id !== authority.agent_id || current.generation !== authority.generation
      || current.token !== authority.token || current.state === 'failed') throw conflict();
}
async function mark(db, input) {
  await assertAuthority(db,input.authority);
  await db.run('UPDATE mission_execution_authority SET state=? WHERE mission_id=? AND token=?',
    input.state,input.authority.mission_id,input.authority.token);
}
async function assertAgentCurrent(db, agentId) {
  if (!agentId) return;
  const stale = await db.get(`WITH RECURSIVE ancestry(id,parent_agent_id) AS (
    SELECT id,parent_agent_id FROM agents WHERE id=?
    UNION SELECT a.id,a.parent_agent_id FROM agents a JOIN ancestry c ON a.id=c.parent_agent_id
    WHERE NOT EXISTS (SELECT 1 FROM missions m WHERE m.orchestrator_agent_id=c.id)
  ) SELECT ma.mission_id FROM ancestry a
    JOIN mission_agents ma ON ma.agent_id=a.id AND ma.role='orchestrator'
    JOIN missions m ON m.mission_id=ma.mission_id
    WHERE m.status IN ('active','dormant')
      AND m.orchestrator_agent_id IS NOT ma.agent_id LIMIT 1`,agentId);
  if (stale) throw conflict();
}
module.exports = { rotate, reserve, assertAuthority, assertAgentCurrent, mark, claimLaunch, isOwnerLive };
