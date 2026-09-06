const { getDatabase } = require('../db');

module.exports = {
  Ping: (call, callback) => callback(null, { status: "Service Experiment is alive via gRPC!" }),

  RunExperiment: async (call, callback) => {
    try {
      const db = await getDatabase();
      const { name, config_json } = call.request || {};
      const expId = `exp-${Date.now()}`;
      let config = {};
      try { config = config_json ? JSON.parse(config_json) : {}; } catch (error) { return callback(null, { experiment_id: '', status: 'error', result_json: JSON.stringify({ error: 'config_json must be valid JSON.' }) }); }
      await db.run(
        'INSERT INTO experiments (id, title, experiment_type, status, protocol_config) VALUES (?, ?, ?, ?, ?)',
        expId, name || 'gRPC experiment', 'scientific_experiment', 'Running', JSON.stringify(config)
      );
      callback(null, { experiment_id: expId, status: 'running', result_json: '{}' });
    } catch (err) {
      callback(null, { experiment_id: '', status: 'error', result_json: JSON.stringify({ error: err.message }) });
    }
  },

  GetExperimentStatus: async (call, callback) => {
    try {
      const db = await getDatabase();
      const exp = await db.get('SELECT * FROM experiments WHERE id = ?', call.request?.experiment_id);
      callback(null, {
        experiment_id: exp?.id || '',
        status: exp?.status || 'not_found',
        result_json: exp?.results_summary || exp?.protocol_config || '{}'
      });
    } catch (err) {
      callback(null, { experiment_id: '', status: 'error', result_json: '{}' });
    }
  }
};
