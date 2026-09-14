const supervisor = require('../services/agentProcessSupervisor');
const runtimeAdapter = require('../services/agentRuntimeAdapter');

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
    try {
      const agentId = call.request?.id;
      const stopped = await runtimeAdapter.stopMission(agentId);
      callback(null, { stopped: Boolean(stopped), status: stopped ? 'stopped' : 'idle' });
    } catch (err) {
      callback(null, { stopped: false, status: 'error' });
    }
  }
};
