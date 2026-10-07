'use strict';

const state = require('./agentOrchestrationState');
const { stopVerified } = require('./garageProcessControl');

function failure(code, message) {
  return Object.assign(new Error(message), { code, status: 409 });
}

function managed(row) {
  return Boolean(row.runtime_pid || state.activeProcesses.has(row.id) || state.missionStarts.has(row.id));
}

function validateScope(row, options) {
  if (options.global) return;
  if (row.organization_id !== (options.scope?.organizationId || null) ||
    row.project_id !== (options.scope?.projectId || null)) {
    throw failure('STOP_SCOPE_CONFLICT', 'Une dépendance appartient à un autre projet.');
  }
}

function validate(rows, options) {
  if (!rows.length) throw Object.assign(new Error('Agent introuvable.'), { code: 'AGENT_NOT_FOUND', status: 404 });
  if (rows.length > 1000) throw failure('STOP_GRAPH_LIMIT', 'La lignée dépasse la limite de sécurité.');
  for (const row of rows) {
    validateScope(row, options);
    if (['running', 'active'].includes(row.status) && !managed(row) && !state.activeWorkerBarriers.has(row.id)) {
      throw failure('EXTERNAL_RUNTIME_UNVERIFIED', `Aucun processus géré ne permet de vérifier l’arrêt de ${row.id}.`);
    }
  }
}

async function lineage(db, agentId) {
  const rows = await db.all(`WITH RECURSIVE family(id) AS (
    SELECT id FROM agents WHERE id=? UNION SELECT a.id FROM agents a JOIN family f ON a.parent_agent_id=f.id
  ) SELECT a.id,a.status,a.runtime_pid,w.organization_id,w.project_id FROM family f
    JOIN agents a ON a.id=f.id LEFT JOIN workspaces w ON w.id=a.workspace_id LIMIT 1001`, agentId);
  const ids = new Set(rows.map(row => row.id));
  for (const row of rows) {
    for (const workerId of state.activeWorkerBarriers.get(row.id)?.workerIds || []) {
      if (!ids.has(workerId)) throw failure('STOP_BARRIER_CONFLICT', 'Barrière non cohérente avec la lignée persistée.');
    }
  }
  return rows;
}

async function stop(db, options) {
  const rows = await lineage(db, options.agentId);
  validate(rows, options);
  const tracked = rows.filter(managed).length;
  for (const row of rows.reverse()) {
    try {
      await stopVerified({ db, workerId: row.id, timeoutMs: options.timeoutMs,
        stopMission: id => require('./agentRuntimeAdapter').stopMission(id, { single: true }) });
    } catch (error) { error.status = 409; throw error; }
    await db.run("UPDATE agents SET status='idle',runtime_pid=NULL,runtime_executable=NULL,runtime_started_at=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=?", row.id);
  }
  return { confirmed: true, stopped: tracked > 0, agents: rows.map(row => row.id) };
}

async function stopAll(db) {
  const rows = await db.all("SELECT id FROM agents WHERE runtime_pid IS NOT NULL OR status IN ('running','active')");
  const ids = new Set([...rows.map(row => row.id), ...state.activeProcesses.keys(), ...state.missionStarts.keys(),
    ...state.activeWorkerBarriers.keys(), ...state.pendingContinuations.keys(), ...state.pendingWorkerRecoveries.keys()]);
  const results = [];
  for (const agentId of ids) results.push(await stop(db, { agentId, global: true }));
  return results;
}

module.exports = { stop, stopAll };
