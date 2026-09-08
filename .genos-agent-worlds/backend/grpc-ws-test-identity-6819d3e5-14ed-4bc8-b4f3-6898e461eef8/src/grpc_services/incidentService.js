const { getDatabase } = require('../db');

module.exports = {
  Ping: (call, callback) => callback(null, { status: "Service Incident is alive via gRPC!" }),

  ReportIncident: async (call, callback) => {
    try {
      const db = await getDatabase();
      const { agent_id, reason, details_json } = call.request || {};
      const incId = `inc-${Date.now()}`;
      await db.run(
        'INSERT INTO global_alerts (id, type, severity, message, details) VALUES (?, ?, ?, ?, ?)',
        incId, 'INCIDENT', 'warning', reason || 'gRPC Incident', details_json || '{}'
      );
      callback(null, { incident_id: incId, status: 'reported' });
    } catch (err) {
      callback(null, { incident_id: '', status: 'error' });
    }
  },

  GetIncidentHistory: async (call, callback) => {
    try {
      const db = await getDatabase();
      const rows = await db.all('SELECT * FROM global_alerts LIMIT 50');
      callback(null, { history_json: JSON.stringify(rows), count: rows.length });
    } catch (err) {
      callback(null, { history_json: '[]', count: 0 });
    }
  }
};
