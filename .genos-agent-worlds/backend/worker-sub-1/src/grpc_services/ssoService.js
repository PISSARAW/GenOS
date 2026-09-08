const { getDatabase } = require('../db');

module.exports = {
  Ping: (call, callback) => callback(null, { status: "Service Sso is alive via gRPC!" }),

  VerifyTicket: (call, callback) => {
    const ticket = call.request?.ticket || '';
    const valid = ticket.length > 5;
    callback(null, { valid, user_email: valid ? 'user@genos.ai' : '' });
  },

  GetConfig: async (call, callback) => {
    try {
      const db = await getDatabase();
      const provider = await db.get('SELECT * FROM sso_providers LIMIT 1');
      callback(null, {
        provider: provider?.protocol || 'oidc',
        issuer: provider?.issuer || 'https://auth.genos.ai'
      });
    } catch (err) {
      callback(null, { provider: 'oidc', issuer: 'https://auth.genos.ai' });
    }
  }
};
