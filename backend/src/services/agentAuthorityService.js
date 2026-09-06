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

async function authorizeMission(db, agentId, orchestratorAgentId, workspaceId = null) {
  const agent = await db.get('SELECT id, name, execution_mode, parent_agent_id, workspace_id, status FROM agents WHERE id = ?', agentId);
  if (!agent) throw authorityError('AGENT_NOT_FOUND', `Agent '${agentId}' was not found.`);
  if (agent.status === 'quarantined') throw authorityError('AGENT_QUARANTINED', `Agent '${agentId}' is quarantined and cannot execute.`);
  if (workspaceId && agent.workspace_id !== workspaceId) throw authorityError('AGENT_WORKSPACE_MISMATCH', `Agent '${agentId}' is not assigned to workspace '${workspaceId}'.`);
  if (agent.execution_mode === 'orchestrator') return agent;
  if (!orchestratorAgentId) {
    throw authorityError('WORKER_REQUIRES_ORCHESTRATOR', `Worker '${agent.name}' cannot start itself; its orchestrator must dispatch the mission.`);
  }
  if (agent.parent_agent_id !== orchestratorAgentId) {
    throw authorityError('WORKER_ORCHESTRATOR_MISMATCH', `Worker '${agent.name}' is not assigned to orchestrator '${orchestratorAgentId}'.`);
  }
  const parent = await db.get('SELECT workspace_id FROM agents WHERE id = ? AND execution_mode = \'orchestrator\'', orchestratorAgentId);
  if (!parent || parent.workspace_id !== agent.workspace_id) throw authorityError('ORCHESTRATOR_WORKSPACE_MISMATCH', `Worker '${agentId}' and orchestrator '${orchestratorAgentId}' are not in the same workspace.`);
  await requireOrchestrator(db, orchestratorAgentId);
  return agent;
}

async function authorizeAgentControl(db, targetId, actorId, workspaceId = null) {
  const target = await db.get('SELECT id, parent_agent_id, execution_mode, workspace_id FROM agents WHERE id = ?', targetId);
  if (!target) throw authorityError('AGENT_NOT_FOUND', `Agent '${targetId}' was not found.`);
  if (workspaceId && target.workspace_id !== workspaceId) throw authorityError('AGENT_WORKSPACE_MISMATCH', `Agent '${targetId}' is outside the requested workspace.`);
  const actor = await db.get('SELECT id, execution_mode, workspace_id FROM agents WHERE id = ?', actorId || '');
  if (!actor || actor.workspace_id !== target.workspace_id) throw authorityError('AGENT_CONTROL_FORBIDDEN', 'The acting agent cannot control this target.');
  if (actor.id !== target.id && actor.execution_mode !== 'orchestrator' && actor.id !== target.parent_agent_id) {
    throw authorityError('AGENT_CONTROL_FORBIDDEN', 'Only the target or its orchestrator may control this agent.');
  }
  return target;
}

module.exports = { EXECUTION_MODES, normalizeExecutionMode, requireOrchestrator, authorizeMission, authorizeAgentControl };
