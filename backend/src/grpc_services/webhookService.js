const { getDatabase } = require('../db');

module.exports = {
  Ping: (call, callback) => callback(null, { status: "Service Webhook is alive via gRPC!" }),

  DispatchWebhook: async (call, callback) => {
    try {
      const { url, event, payload_json } = call.request || {};
      const payload = payload_json ? JSON.parse(payload_json) : {};
      const webhook = require('../services/webhookService');
      webhook.dispatch({ eventType: event || 'custom', payload, targetUrl: url });
      callback(null, { dispatched: true, status_code: 200 });
    } catch (err) {
      callback(null, { dispatched: false, status_code: 500 });
    }
  },

  ListWebhooks: async (call, callback) => {
    try {
      const db = await getDatabase();
      const hooks = await db.all('SELECT url FROM webhook_subscriptions WHERE enabled = 1');
      callback(null, { webhooks: hooks.map((h) => h.url) });
    } catch (_) {
      callback(null, { webhooks: [] });
    }
  }
};
