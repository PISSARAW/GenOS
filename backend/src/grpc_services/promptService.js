const resilience = require('../services/resilienceService');

module.exports = {
  Ping: (call, callback) => callback(null, { status: "Service Prompt is alive via gRPC!" }),

  EvaluatePromptDrift: (call, callback) => {
    const { base_prompt, current_prompt } = call.request || {};
    const drift = resilience.evaluatePromptDrift(base_prompt || '', current_prompt || '');
    callback(null, {
      levenshtein_ratio: drift.ratio || 1.0,
      drift_status: drift.status || 'NORMAL'
    });
  },

  GetPromptTemplate: (call, callback) => {
    const role = call.request?.role || 'worker';
    callback(null, { template: `You are an autonomous ${role} in GenOS swarm.` });
  }
};
