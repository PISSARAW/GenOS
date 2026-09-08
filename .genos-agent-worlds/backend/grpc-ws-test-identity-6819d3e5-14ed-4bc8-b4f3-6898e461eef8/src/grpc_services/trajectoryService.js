const trajectory = require('../services/trajectoryService');

module.exports = {
  Ping: (call, callback) => callback(null, { status: "Service Trajectory is alive via gRPC!" }),

  RecordTrajectory: async (call, callback) => {
    try {
      const { agent_id, step_action, detail } = call.request || {};
      await trajectory.recordStep(agent_id, { action: step_action, detail });
      const steps = await trajectory.getSteps(agent_id, 10);
      callback(null, {
        agent_id: agent_id || '',
        steps: (steps || []).map((s) => s.action || 'step')
      });
    } catch (err) {
      callback(null, { agent_id: '', steps: [] });
    }
  },

  GetTrajectory: async (call, callback) => {
    try {
      const { agent_id, limit } = call.request || {};
      const steps = await trajectory.getSteps(agent_id, limit || 20);
      callback(null, {
        agent_id: agent_id || '',
        steps: (steps || []).map((s) => s.action || 'step')
      });
    } catch (err) {
      callback(null, { agent_id: '', steps: [] });
    }
  }
};
