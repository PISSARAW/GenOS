const runtimeAdapter = require('../services/agentRuntimeAdapter');

module.exports = {
  Ping: (call, callback) => callback(null, { status: "Service Agent is alive via gRPC!" }),

  StartMission: async (call, callback) => {
    try {
      const mission = call.request || {};
      await runtimeAdapter.startMission({
        agentId: mission.agent_id,
        name: mission.name,
        role: mission.role,
        prompt: mission.prompt,
        modelTier: mission.model_tier,
        workspaceRoot: mission.workspace_root,
        workspaceIsolation: mission.workspace_isolation,
        agentType: mission.agent_type,
        executionMode: mission.execution_mode,
        strategyContract: parseJson(mission.strategy_contract_json, {}),
        orchestratorAgentId: mission.orchestrator_agent_id,
        autonomyPlan: parseJson(mission.autonomy_plan_json, {}),
        toolLease: parseJson(mission.tool_lease_json, []),
        genosCapsule: parseJson(mission.genos_capsule_json, {}),
        executionPolicy: parseJson(mission.execution_policy_json, {}),
        executionBudget: parseJson(mission.execution_budget_json, {}),
        nameMeaning: mission.name_meaning
      });
      callback(null, { success: true, message: `Mission for agent ${mission.agent_id} started` });
    } catch (err) {
      callback(null, { success: false, message: err.message });
    }
  },

  StopMission: async (call, callback) => {
    const agentId = call.request?.id;
    const stopped = Boolean(agentId && runtimeAdapter.stopMission(agentId));
    callback(null, { stopped, status: stopped ? 'stopped' : 'not_running' });
  }
};

function parseJson(value, fallback) {
  try { return value ? JSON.parse(value) : fallback; } catch (_) { return fallback; }
}
