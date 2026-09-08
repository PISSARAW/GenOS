const resilience = require('../services/resilienceService');

module.exports = {
  Ping: (call, callback) => callback(null, { status: "Service Prompt is alive via gRPC!" }),

  EvaluatePromptDrift: (call, callback) => {
    const { base_prompt, current_prompt } = call.request || {};
    const drift = resilience.trackHypermutationDrift(base_prompt || '', current_prompt || '');
    callback(null, {
      levenshtein_ratio: drift.driftScore,
      drift_status: drift.status
    });
  },

  GetPromptTemplate: (call, callback) => {
    const role = call.request?.role || 'worker';
    callback(null, { template: `You are an autonomous ${role} in GenOS swarm.` });
  }
};
