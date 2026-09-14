const resilience = require('../services/resilienceService');
const { getDatabase } = require('../db');

module.exports = {
  Ping: (call, callback) => callback(null, { status: "Service Resilience is alive via gRPC!" }),

  TriggerApoptosis: async (call, callback) => {
    try {
      const { agent_id, reason } = call.request || {};
      const db = await getDatabase();
      const report = await resilience.evaluateApoptosis(agent_id || 'system', { reason: reason || 'manual' }, db);
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
      const db = await getDatabase();
      const workspaceId = state.workspaceId || state.workspace_id || 'fleet';
      const snap = await resilience.freezeCryptobiosis(db, workspaceId, 'gRPC freeze', { ...state, agentId: agent_id });
      callback(null, {
        snapshot_id: snap.snapshotId || '',
        frozen: Boolean(snap.snapshotId)
      });
    } catch (err) {
      callback(null, { snapshot_id: '', frozen: false });
    }
  },

  ThawState: async (call, callback) => {
    try {
      const { snapshot_id } = call.request || {};
      const db = await getDatabase();
      const thawed = await resilience.thawCryptobiosis(db, snapshot_id);
      const state = thawed.state || {};
      callback(null, {
        agent_id: state.agentId || thawed.agentId || '',
        restored_state_json: JSON.stringify(state)
      });
    } catch (err) {
      callback(null, { agent_id: '', restored_state_json: '{}' });
    }
  }
};
