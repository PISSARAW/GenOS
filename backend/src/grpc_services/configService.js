const runtimeConfig = {
  version: '3.0.0',
  environment: process.env.NODE_ENV || 'development'
};

module.exports = {
  Ping: (call, callback) => callback(null, { status: "Service Config is alive via gRPC!" }),

  GetConfig: (call, callback) => {
    callback(null, { config_json: JSON.stringify(runtimeConfig) });
  },

  UpdateConfig: (call, callback) => {
    const { key, value_json } = call.request || {};
    try {
      const val = value_json ? JSON.parse(value_json) : null;
      if (key) runtimeConfig[key] = val;
      callback(null, { config_json: JSON.stringify(runtimeConfig) });
    } catch (err) {
      callback(null, { config_json: JSON.stringify(runtimeConfig) });
    }
  }
};
