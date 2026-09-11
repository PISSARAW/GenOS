const config = require('../config');

module.exports = {
  Ping: (call, callback) => callback(null, { status: "Service SSO is alive via gRPC!" }),

  VerifyTicket: (call, callback) => {
    const ticket = call.request?.ticket || '';
    const valid = ticket.length > 5;
    callback(null, { valid, user_email: valid ? 'user@genos.ai' : '' });
  },

  GetConfig: (call, callback) => {
    callback(null, { provider: 'oidc', issuer: 'https://auth.genos.ai' });
  }
};
