const os = require('os');

const systemConfig = {
  version: '3.0.0-PROD',
  environment: 'production-local',
  maxTokens: 500000,
  waveTime: 42
};

module.exports = {
  Ping: (call, callback) => callback(null, { status: "Service Config is alive via gRPC!" }),

  GetConfig: (call, callback) => {
    callback(null, { config_json: JSON.stringify(systemConfig) });
  },

  UpdateConfig: (call, callback) => {
    const { key, value_json } = call.request || {};
    try {
      if (key && value_json) {
        systemConfig[key] = JSON.parse(value_json);
      }
      callback(null, { config_json: JSON.stringify(systemConfig) });
    } catch (err) {
      callback(null, { config_json: JSON.stringify(systemConfig) });
    }
  }
};
