const evalObs = require('../services/evaluationObservabilityService');

module.exports = {
  Ping: (call, callback) => callback(null, { status: "Service Eval is alive via gRPC!" }),

  EvaluateMetric: (call, callback) => {
    try {
      const { metric_name, values } = call.request || {};
      const score = evalObs.calculateMetricScore(metric_name, values || []);
      callback(null, { score: score.value, evaluation: score.evaluation });
    } catch (error) {
      callback({ code: 3, message: error.message });
    }
  },

  GetSummary: async (call, callback) => {
    try {
      const request = call.request || {};
      const organizationId = String(request.organization_id || '').trim();
      const projectId = String(request.project_id || '').trim();
      if (!organizationId || !projectId) return callback({ code: 3, message: 'organization_id and project_id are required.' });
      const summary = await evalObs.getObservabilitySummary({ organizationId, projectId });
      callback(null, { summary_json: JSON.stringify(summary || {}) });
    } catch (error) {
      callback({ code: 13, message: error.message });
    }
  }
};
