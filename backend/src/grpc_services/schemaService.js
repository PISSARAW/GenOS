const specValidator = require('../services/specValidator');

module.exports = {
  Ping: (call, callback) => callback(null, { status: "Service Schema is alive via gRPC!" }),

  ValidateSchema: (call, callback) => {
    const { schema_name, data_json } = call.request || {};
    try {
      const data = data_json ? JSON.parse(data_json) : {};
      const result = specValidator.validateSpec(schema_name, data);
      callback(null, { valid: result.valid, errors: result.errors || [] });
    } catch (err) {
      callback(null, { valid: false, errors: [err.message] });
    }
  },

  GetSchemaSpec: (call, callback) => {
    const schemaName = call.request?.schema_name || 'default';
    const result = specValidator.validateSpec(schemaName, {});
    callback(null, { json_schema: JSON.stringify({ schema: result.schema, title: result.title, available: result.available }) });
  }
};
