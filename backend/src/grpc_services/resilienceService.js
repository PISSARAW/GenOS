const resilience = require('../services/resilienceService');

module.exports = {
  Ping: (call, callback) => callback(null, { status: "Service Resilience is alive via gRPC!" }),

  TriggerApoptosis: async (call, callback) => {
    try {
      const { agent_id, reason } = call.request || {};
      const report = await resilience.evaluateApoptosis(agent_id || 'system', { consecutiveFailures: 5 });
      callback(null, {
        triggered: true,
        autopsy_report_json: JSON.stringify(report)
      });
    } catch (err) {
      callback(null, { triggered: false, autopsy_report_json: JSON.stringify({ error: err.message }) });
    }
  },

  FreezeState: (call, callback) => {
    try {
      const { agent_id, state_json } = call.request || {};
      const state = state_json ? JSON.parse(state_json) : {};
      const snap = resilience.freezeCryptobiosis(agent_id || 'system', 'gRPC Freeze', state);
      callback(null, {
        snapshot_id: snap.snapshotId,
        frozen: snap.success === true
      });
    } catch (err) {
      callback(null, { snapshot_id: '', frozen: false });
    }
  },

  ThawState: (call, callback) => {
    try {
      const { snapshot_id } = call.request || {};
      const thawed = resilience.thawCryptobiosis(snapshot_id);
      callback(null, {
        agent_id: thawed.workspaceId || '',
        restored_state_json: JSON.stringify(thawed.state || {})
      });
    } catch (err) {
      callback(null, { agent_id: '', restored_state_json: '{}' });
    }
  }
};
