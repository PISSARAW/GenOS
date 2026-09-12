const runtimeAdapter = require('../services/agentRuntimeAdapter');

module.exports = {
  Ping: (call, callback) => callback(null, { status: "Service Agent is alive via gRPC!" }),

  StartMission: async (call, callback) => {
    try {
      const mission = call.request || {};
      if (typeof runtimeAdapter.superviseMission === 'function') {
        runtimeAdapter.superviseMission(mission).catch(console.error);
      }
      callback(null, { success: true, message: `Mission for agent ${mission.agent_id} started` });
    } catch (err) {
      callback(null, { success: false, message: err.message });
    }
  },

  StopMission: async (call, callback) => {
    try {
      const agentId = call.request?.id;
      const stopped = Boolean(await runtimeAdapter.stopMission(agentId));
      callback(null, { stopped, status: stopped ? 'stopped' : 'not_running' });
    } catch (err) {
      callback(null, { stopped: false, status: 'error' });
    }
  }
};
