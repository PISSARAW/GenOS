'use strict';

function retryableDatabaseError(error) {
  return error?.code === 'SQLITE_BUSY' || /busy|locked/i.test(error?.message || '');
}

async function load(db, context) {
  const agents = await db.all(`SELECT a.id, a.status, a.runtime_pid,
    (SELECT r.status FROM strategy_execution_runs r WHERE r.agent_id = a.id ORDER BY r.rowid DESC LIMIT 1) AS latest_run_status
    FROM agents a WHERE a.id = ? OR a.parent_agent_id = ?`, context.agentId, context.agentId);
  const trinityWorlds = await db.all(
    `SELECT agent_id, status FROM trinity_worlds
     WHERE experiment_id GLOB ? AND datetime(created_at) >= datetime(?)
     ORDER BY world_number`,
    `trinity_${context.agentId}*`, new Date(context.startedAt).toISOString()
  );
  return { agents, trinityWorlds };
}

async function poll(db, context, busyRetries) {
  try { return await load(db, context); }
  catch (error) {
    if (!retryableDatabaseError(error)) throw error;
    await new Promise((resolve) => setTimeout(resolve,
      Math.min(3000, 300 * Math.pow(1.5, busyRetries))));
    return { retry: true, busyRetries: busyRetries + 1 };
  }
}

function withinDeadline(unbounded, deadline) {
  return unbounded || Date.now() < deadline;
}

function allOrphaned(agents, startedAt) {
  return agents.length > 0
    && !require('../src/services/runtimeMissionTasks').hasPending()
    && agents.every((agent) => agent.status === 'running' && !agent.runtime_pid)
    && Date.now() > startedAt + 30000;
}

function terminalReady(agents, worlds, agentId) {
  return !require('../src/services/runtimeMissionTasks').hasPending()
    && require('../src/services/orchestratorMissionStatus').missionExecutionTerminal(agents, worlds, agentId);
}

module.exports = { allOrphaned, poll, withinDeadline, terminalReady };
