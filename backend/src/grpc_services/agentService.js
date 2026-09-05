const supervisor = require('../services/agentProcessSupervisor');
const { activeProcesses, updateAgent } = require('../services/agentOrchestrationState');

module.exports = {
  Ping: (call, callback) => callback(null, { status: "Service Agent is alive via gRPC!" }),

  StartMission: async (call, callback) => {
    try {
      const mission = call.request || {};
      supervisor.superviseMission(mission).catch(console.error);
      callback(null, { success: true, message: `Mission for agent ${mission.agent_id} started` });
    } catch (err) {
      callback(null, { success: false, message: err.message });
    }
  },

  StopMission: async (call, callback) => {
    const agentId = call.request?.id;
    if (agentId && activeProcesses.has(agentId)) {
      const proc = activeProcesses.get(agentId);
      try { proc.kill(); } catch {}
      activeProcesses.delete(agentId);
      await updateAgent(agentId, 'terminated', 'Terminated via gRPC');
    }
    callback(null, { stopped: true, status: 'stopped' });
  }
};
