const evalObs = require('../services/evaluationObservabilityService');

module.exports = {
  Ping: (call, callback) => callback(null, { status: "Service Eval is alive via gRPC!" }),

  EvaluateMetric: (call, callback) => {
    const { metric_name, values } = call.request || {};
    const score = evalObs.calculateMetricScore(metric_name, values || []);
    callback(null, {
      score: score.value || 0.85,
      evaluation: score.evaluation || 'NOMINAL'
    });
  },

  GetSummary: (call, callback) => {
    const summary = evalObs.getObservabilitySummary();
    callback(null, { summary_json: JSON.stringify(summary || {}) });
  }
};
