const { getDatabase } = require('../../db');
const { processMatches, terminatePid } = require('../processTermination');

async function stopMissionChildren(agentId, stop) {
  try {
    const db = await getDatabase();
    const children = await db.all(
      "SELECT id FROM agents WHERE parent_agent_id = ? AND status IN ('running', 'ready', 'active')",
      agentId
    );
    if (children && children.length > 0) {
      await Promise.all(children.map((c) => stop(c.id)));
      return true;
    }
  } catch (_) {}
  return false;
}

async function stopPersistedRuntime(agentId) {
  try {
    const db = await getDatabase();
    const agent = await db.get('SELECT runtime_pid, runtime_executable FROM agents WHERE id = ?', agentId);
    if (agent?.runtime_pid) {
      const matches = processMatches(agent.runtime_pid, agent.runtime_executable);
      if (matches) terminatePid(agent.runtime_pid);
      await db.run("UPDATE agents SET status = ?, runtime_pid = NULL, runtime_started_at = NULL, runtime_executable = NULL, current_task = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", matches ? 'blocked' : 'error', matches ? 'Stopped from Studio' : 'Persisted runtime PID did not match its executable.', agentId);
      return { handled: true, killed: Boolean(matches) };
    }
  } catch (_) {}
  return { handled: false, killed: false };
}

module.exports = { stopMissionChildren, stopPersistedRuntime };
