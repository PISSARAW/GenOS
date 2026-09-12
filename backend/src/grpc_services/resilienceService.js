const resilience = require('../services/resilienceService');
const { getDatabase } = require('../db');

module.exports = {
  Ping: (call, callback) => callback(null, { status: "Service Resilience is alive via gRPC!" }),

  TriggerApoptosis: async (call, callback) => {
    try {
      const { agent_id, reason } = call.request || {};
      const report = await resilience.evaluateApoptosis(agent_id || 'system', { reason: reason || 'manual' });
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
      const snap = await resilience.freezeCryptobiosis(db, 'fleet', 'gRPC Freeze', { agentId: agent_id, ...state });
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
      const db = await getDatabase();
      const thawed = await resilience.thawCryptobiosis(db, snapshot_id || 'snap-1');
      const row = await db.get('SELECT agent_id FROM cryptobiosis_snapshots WHERE snapshot_id = ? OR id = ?', snapshot_id, snapshot_id);
      callback(null, {
        agent_id: row?.agent_id || thawed.state?.agentId || '',
        restored_state_json: JSON.stringify(thawed.state || {})
      });
    } catch (err) {
      callback(null, { agent_id: '', restored_state_json: '{}' });
    }
  }
};
