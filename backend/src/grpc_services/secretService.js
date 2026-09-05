const secretVault = require('../services/secretVault');

module.exports = {
  Ping: (call, callback) => callback(null, { status: "Service Secret is alive via gRPC!" }),

  GetSecret: (call, callback) => {
    const val = secretVault.get(call.request?.key || '');
    callback(null, { found: !!val, value: val || '' });
  },

  StoreSecret: (call, callback) => {
    const { key, value } = call.request || {};
    secretVault.set(key, value);
    callback(null, { found: true, value });
  }
};
