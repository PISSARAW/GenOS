const resilience = require('../services/resilienceService');

module.exports = {
  Ping: (call, callback) => callback(null, { status: "Service Resilience is alive via gRPC!" }),

  TriggerApoptosis: async (call, callback) => {
    try {
      const { agent_id, reason } = call.request || {};
      const report = await resilience.generateApoptosisReport(agent_id || 'system', reason || 'manual');
      callback(null, {
        triggered: true,
        autopsy_report_json: JSON.stringify(report)
      });
    } catch (err) {
      callback(null, { triggered: false, autopsy_report_json: JSON.stringify({ error: err.message }) });
    }
  },

  FreezeState: async (call, callback) => {
    try {
      const { agent_id, state_json } = call.request || {};
      const state = state_json ? JSON.parse(state_json) : {};
      const snap = await resilience.freezeAgentState(agent_id || 'system', state);
      callback(null, {
        snapshot_id: snap.snapshotId || 'snap-1',
        frozen: snap.success !== false
      });
    } catch (err) {
      callback(null, { snapshot_id: '', frozen: false });
    }
  },

  ThawState: async (call, callback) => {
    try {
      const { snapshot_id } = call.request || {};
      const thawed = await resilience.thawAgentState(snapshot_id || 'snap-1');
      callback(null, {
        agent_id: thawed.agentId || '',
        restored_state_json: JSON.stringify(thawed.state || {})
      });
    } catch (err) {
      callback(null, { agent_id: '', restored_state_json: '{}' });
    }
  }
};
