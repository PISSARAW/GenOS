'use strict';

const sessions = require('../../topologySessionStore');

const TOPOLOGY = 'a_team_learning';

async function load(db, debriefId) {
  const record = await sessions.load(db, debriefId);
  if (!record || record.topology !== TOPOLOGY) return null;
  return { ...record.state, revision: record.revision };
}

async function save(db, debrief) {
  const existing = await load(db, debrief.debriefId);
  if (existing) {
    if (existing.teamRunId !== debrief.teamRunId) throw conflict(debrief.debriefId);
    return { debrief: existing, created: false };
  }
  try {
    const saved = await sessions.save(db, { id: debrief.debriefId, topology: TOPOLOGY, state: debrief });
    return { debrief: { ...debrief, revision: saved.revision }, created: true };
  } catch (error) {
    if (error.code !== 'TOPOLOGY_SESSION_CONFLICT') throw error;
    const raced = await load(db, debrief.debriefId);
    if (raced?.teamRunId === debrief.teamRunId) return { debrief: raced, created: false };
    throw error;
  }
}

async function list(db, taskProfile) {
  await sessions.ensureTable(db);
  const rows = await db.all('SELECT state_json FROM topology_sessions WHERE topology = ?', TOPOLOGY);
  return rows.map(readState).filter((row) => row && (!taskProfile || row.taskProfile === taskProfile));
}

function readState(row) {
  try { return JSON.parse(row.state_json || '{}'); } catch (_) { return null; }
}

function conflict(debriefId) {
  return Object.assign(new Error(`A-Team debrief identity conflict '${debriefId}'.`), { code: 'ATEAM_DEBRIEF_CONFLICT' });
}

module.exports = { TOPOLOGY, load, save, list };
