const config = require('../config');

module.exports = {
  Ping: (call, callback) => callback(null, { status: "Service Config is alive via gRPC!" }),

  GetConfig: (call, callback) => {
    callback(null, { config_json: JSON.stringify(config) });
  },

  UpdateConfig: (call, callback) => {
    const { key, value_json } = call.request || {};
    try {
      const val = value_json ? JSON.parse(value_json) : null;
      if (key) config[key] = val;
      callback(null, { config_json: JSON.stringify(config) });
    } catch (err) {
      callback(null, { config_json: JSON.stringify(config) });
    }
  }
};
