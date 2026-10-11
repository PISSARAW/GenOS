'use strict';

const { withTransaction } = require('../../../db');
const store = require('../metapopulationStore');
const snapshot = require('../../topologySnapshots/metapopulation');

function refuse(code, message) {
  throw Object.assign(new Error(message), { code, status: 409 });
}

async function assertIdleMission(db, missionId) {
  const agents = await db.all(`SELECT a.id, a.status, a.runtime_pid FROM mission_agents ma
    JOIN agents a ON a.id = ma.agent_id WHERE ma.mission_id = ?`, missionId);
  if (!agents.length || agents.some((agent) => agent.status === 'running'
    || agent.status === 'Active' || agent.runtime_pid != null)) {
    refuse('METAPOPULATION_QUIESCENCE_WORKERS_ACTIVE', 'Mission agents must all be idle and present.');
  }
}

async function assertSnapshotBoundary(input, session) {
  const context = { db: input.db, scope: { clause: 'w.id = ?', params: [input.workspaceId] },
    sessionId: session.id, variantId: session.variant, agentId: input.agentId,
    workspaceId: input.workspaceId, topologyId: 'metapopulation' };
  return snapshot.capture(context);
}

async function quiesceForSnapshot(input) {
  if (!input?.db || !input.sessionId || !input.agentId || !input.workspaceId) {
    refuse('METAPOPULATION_QUIESCENCE_CONTEXT_REQUIRED', 'Database, session, agent and workspace are required.');
  }
  return withTransaction(input.db, async () => {
    const session = await input.db.get('SELECT id, mission_id, variant, status, revision FROM metapopulation_sessions WHERE id = ?', input.sessionId);
    if (!session || session.status === 'CLOSED') {
      refuse('METAPOPULATION_QUIESCENCE_SESSION_INVALID', 'An open regional session is required.');
    }
    await assertIdleMission(input.db, session.mission_id);
    if (session.status !== 'QUIESCENT') {
      const updated = await input.db.run("UPDATE metapopulation_sessions SET status = 'QUIESCENT' WHERE id = ? AND revision = ?",
        session.id, session.revision);
      if (updated.changes !== 1) refuse('METAPOPULATION_QUIESCENCE_CONFLICT', 'Regional session advanced.');
      await store.appendEvent(input.db, session.id, { type: 'SESSION_QUIESCED', actor: input.agentId,
        payload: { agentId: input.agentId }, provenance: { source: 'snapshotQuiescenceService' } });
    }
    const current = await input.db.get('SELECT id, variant, status, revision FROM metapopulation_sessions WHERE id = ?', session.id);
    const boundary = await assertSnapshotBoundary(input, current);
    return { sessionId: session.id, status: current.status, revision: current.revision,
      boundaryHash: require('../../topologySnapshotContract').digest(boundary.boundary),
      boundaryVerified: true, missionVerified: false };
  });
}

module.exports = { quiesceForSnapshot };
