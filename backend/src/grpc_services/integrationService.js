const webhook = require('../services/webhookService');

module.exports = {
  Ping: (call, callback) => callback(null, { status: "Service Integration is alive via gRPC!" }),

  TriggerIntegration: async (call, callback) => {
    try {
      const { integration_id, payload_json } = call.request || {};
      const payload = payload_json ? JSON.parse(payload_json) : {};
      const res = await webhook.dispatchIntegration(integration_id, payload);
      callback(null, { success: true, result: JSON.stringify(res) });
    } catch (err) {
      callback(null, { success: false, result: err.message });
    }
  },

  ListIntegrations: (call, callback) => {
    callback(null, { integrations: ['slack', 'github', 'discord', 'generic-webhook'] });
  }
};
