module.exports = {
  Ping: (call, callback) => callback(null, { status: "Service SSO is alive via gRPC!" }),

  VerifyTicket: (call, callback) => {
    const ticket = call.request?.ticket || '';
    const secret = process.env.GENOS_SSO_SECRET || process.env.JWT_SECRET;
    if (!ticket || !secret) {
      return callback(null, { valid: false, user_email: '' });
    }
    const valid = ticket.startsWith('sso_') && ticket.length >= 16;
    const email = process.env.GENOS_SSO_DEFAULT_EMAIL || '';
    callback(null, { valid, user_email: valid ? email : '' });
  },

  GetConfig: (call, callback) => {
    const provider = process.env.GENOS_SSO_PROVIDER || 'oidc';
    const issuer = process.env.GENOS_SSO_ISSUER || '';
    callback(null, { provider, issuer });
  }
};
