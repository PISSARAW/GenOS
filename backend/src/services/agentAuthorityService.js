const EXECUTION_MODES = Object.freeze(['orchestrator', 'worker']);

function normalizeExecutionMode(value) {
  const mode = String(value || 'orchestrator').trim().toLowerCase();
  if (!EXECUTION_MODES.includes(mode)) {
    const error = new Error(`executionMode must be one of: ${EXECUTION_MODES.join(', ')}`);
    error.code = 'INVALID_EXECUTION_MODE';
    throw error;
  }
  return mode;
}

function authorityError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

async function requireOrchestrator(db, agentId) {
  const agent = await db.get('SELECT id, name, execution_mode FROM agents WHERE id = ?', agentId);
  if (!agent) throw authorityError('ORCHESTRATOR_NOT_FOUND', `Orchestrator '${agentId}' was not found.`);
  if (agent.execution_mode !== 'orchestrator') {
    throw authorityError('ORCHESTRATOR_REQUIRED', `Agent '${agentId}' is a worker and cannot orchestrate other agents.`);
  }
  return agent;
}

async function authorizeMission(db, agentId, orchestratorAgentId) {
  const agent = await db.get('SELECT id, name, execution_mode, parent_agent_id FROM agents WHERE id = ?', agentId);
  if (!agent) throw authorityError('AGENT_NOT_FOUND', `Agent '${agentId}' was not found.`);
  if (agent.execution_mode === 'orchestrator') return agent;
  if (!orchestratorAgentId) {
    throw authorityError('WORKER_REQUIRES_ORCHESTRATOR', `Worker '${agent.name}' cannot start itself; its orchestrator must dispatch the mission.`);
  }
  if (agent.parent_agent_id !== orchestratorAgentId) {
    throw authorityError('WORKER_ORCHESTRATOR_MISMATCH', `Worker '${agent.name}' is not assigned to orchestrator '${orchestratorAgentId}'.`);
  }
  await requireOrchestrator(db, orchestratorAgentId);
  return agent;
}

module.exports = { EXECUTION_MODES, normalizeExecutionMode, requireOrchestrator, authorizeMission };
