const webhook = require('../services/webhookService');

module.exports = {
  Ping: (call, callback) => callback(null, { status: "Service Webhook is alive via gRPC!" }),

  DispatchWebhook: async (call, callback) => {
    try {
      const { url, event, payload_json } = call.request || {};
      const payload = payload_json ? JSON.parse(payload_json) : {};
      const res = await webhook.send(url, event, payload);
      callback(null, { dispatched: true, status_code: res.statusCode || 200 });
    } catch (err) {
      callback(null, { dispatched: false, status_code: 500 });
    }
  },

  ListWebhooks: (call, callback) => {
    callback(null, { webhooks: ['webhook-events', 'webhook-alerts'] });
  }
};
