const specValidator = require('../services/specValidator');

module.exports = {
  Ping: (call, callback) => callback(null, { status: "Service Schema is alive via gRPC!" }),

  ValidateSchema: (call, callback) => {
    const { schema_name, data_json } = call.request || {};
    try {
      const data = data_json ? JSON.parse(data_json) : {};
      const res = specValidator.validate(schema_name, data);
      callback(null, { valid: res.valid !== false, errors: res.errors || [] });
    } catch (err) {
      callback(null, { valid: false, errors: [err.message] });
    }
  },

  GetSchemaSpec: (call, callback) => {
    const spec = specValidator.getSchema(call.request?.schema_name || 'default');
    callback(null, { json_schema: JSON.stringify(spec || {}) });
  }
};
