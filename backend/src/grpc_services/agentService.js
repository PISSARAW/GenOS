const runtimeAdapter = require('../services/agentRuntimeAdapter');
const { getDatabase } = require('../db');
const agentAuthority = require('../services/agentAuthorityService');
const grpc = require('@grpc/grpc-js');

async function resolveWorkspace(request) {
  const workspaceId = String(request.workspace_id || '').trim();
  if (!workspaceId) throw Object.assign(new Error('workspace_id is required.'), { code: 'INVALID_MISSION_SCOPE' });
  const organizationId = String(request.organization_id || '').trim();
  const projectId = String(request.project_id || '').trim();
  const db = await getDatabase();
  const workspace = organizationId && projectId
    ? await db.get('SELECT * FROM workspaces WHERE id = ? AND organization_id = ? AND project_id = ?', workspaceId, organizationId, projectId)
    : await db.get('SELECT * FROM workspaces WHERE id = ? AND organization_id IS NULL AND project_id IS NULL', workspaceId);
  if (!workspace) throw Object.assign(new Error(`Workspace '${workspaceId}' is not available in the requested project.`), { code: 'INVALID_MISSION_SCOPE' });
  return workspace;
}

module.exports = {
  Ping: (call, callback) => callback(null, { status: "Service Agent is alive via gRPC!" }),

  StartMission: async (call, callback) => {
    try {
      const mission = call.request || {};
      const workspace = await resolveWorkspace(mission);
      const db = await getDatabase();
      const agent = await db.get('SELECT id, execution_mode, parent_agent_id FROM agents WHERE id = ? AND workspace_id = ?', mission.agent_id, workspace.id);
      if (!agent) throw Object.assign(new Error('Agent is not part of the requested workspace.'), { code: 'INVALID_MISSION_SCOPE' });
      await agentAuthority.authorizeMission(db, agent.id, mission.orchestrator_agent_id, workspace.id);
      const startPromise = runtimeAdapter.startMission({
        agentId: mission.agent_id,
        name: mission.name,
        role: mission.role,
        prompt: mission.prompt,
        modelTier: mission.model_tier,
        workspaceRoot: workspace.path,
        workspaceId: workspace.id,
        workspaceIsolation: mission.workspace_isolation,
        agentType: mission.agent_type,
        executionMode: mission.execution_mode,
        strategyContract: parseJson(mission.strategy_contract_json, {}, 'strategy_contract_json'),
        orchestratorAgentId: mission.orchestrator_agent_id,
        autonomyPlan: parseJson(mission.autonomy_plan_json, {}, 'autonomy_plan_json'),
        toolLease: parseToolLease(mission.tool_lease_json),
        genosCapsule: parseJson(mission.genos_capsule_json, {}, 'genos_capsule_json'),
        executionPolicy: parseJson(mission.execution_policy_json, {}, 'execution_policy_json'),
        executionBudget: parseJson(mission.execution_budget_json, {}, 'execution_budget_json'),
        nameMeaning: mission.name_meaning
      });
      const result = await startPromise;
      callback(null, { success: true, message: result?.duplicate ? `Mission for agent ${mission.agent_id} already running` : `Mission for agent ${mission.agent_id} started` });
    } catch (err) {
      callback({ code: grpcStatusForError(err), message: err.message });
    }
  },

  StopMission: async (call, callback) => {
    try {
      const request = call.request || {};
      const workspace = await resolveWorkspace(request);
      const db = await getDatabase();
      const agent = await db.get('SELECT id FROM agents WHERE id = ? AND workspace_id = ?', request.id, workspace.id);
      if (!agent) return callback({ code: grpc.status.NOT_FOUND, message: `Agent '${request.id || ''}' was not found in the requested workspace.` });
    } catch (err) {
      return callback({ code: grpcStatusForError(err), message: err.message });
    }
    const agentId = call.request?.id;
    const stopped = Boolean(agentId && runtimeAdapter.stopMission(agentId));
    callback(null, { stopped, status: stopped ? 'stopped' : 'not_running' });
  }
};

function parseJson(value, fallback, fieldName) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch (_) {
    const error = new Error(`${fieldName} must be valid JSON.`);
    error.code = 'INVALID_MISSION_JSON';
    throw error;
  }
}

function parseToolLease(value) {
  const lease = parseJson(value, [], 'tool_lease_json');
  if (!Array.isArray(lease) || lease.some((tool) => typeof tool !== 'string' || !tool.trim())) {
    const error = new Error('tool_lease_json must be an array of non-empty tool names.');
    error.code = 'INVALID_MISSION_JSON';
    throw error;
  }
  return [...new Set(lease.map((tool) => tool.trim()))];
}

function grpcStatusForError(error) {
  if (Number.isInteger(error?.code)) return error.code;
  if (error?.code === 'INVALID_MISSION_JSON') return grpc.status.INVALID_ARGUMENT;
  if (['INVALID_MISSION_SCOPE', 'PERMISSION_DENIED', 'UNAUTHENTICATED'].includes(error?.code)) return grpc.status.PERMISSION_DENIED;
  if (['NOT_FOUND', 'AGENT_NOT_FOUND', 'WORKSPACE_NOT_FOUND'].includes(error?.code)) return grpc.status.NOT_FOUND;
  if (error?.code === 'ALREADY_EXISTS') return grpc.status.ALREADY_EXISTS;
  if (error?.code === 'RESOURCE_EXHAUSTED') return grpc.status.RESOURCE_EXHAUSTED;
  if (error?.code === 'DEADLINE_EXCEEDED' || error?.code === 'TIMEOUT') return grpc.status.DEADLINE_EXCEEDED;
  if (error?.code === 'UNAVAILABLE') return grpc.status.UNAVAILABLE;
  if (error?.code === 'FAILED_PRECONDITION') return grpc.status.FAILED_PRECONDITION;
  return grpc.status.INTERNAL;
}

module.exports.parseToolLease = parseToolLease;
module.exports.grpcStatusForError = grpcStatusForError;
