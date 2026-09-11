const supervisor = require('../services/agentProcessSupervisor');

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

  StopMission: (call, callback) => {
    const agentId = call.request?.id;
    supervisor.stopMission(agentId);
    callback(null, { stopped: true, status: 'stopped' });
  }
};
