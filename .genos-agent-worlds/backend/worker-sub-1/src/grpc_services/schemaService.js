const fs = require('fs');
const path = require('path');
const grpc = require('@grpc/grpc-js');
const specValidator = require('../services/specValidator');

const repositoryRoot = path.resolve(__dirname, '../../..');
const SPEC_DIR = path.join(repositoryRoot, 'spec');

module.exports = {
  Ping: (call, callback) => callback(null, { status: "Service Schema is alive via gRPC!" }),

  ValidateSchema: (call, callback) => {
    const { schema_name, data_json } = call.request || {};
    if (!schema_name) {
      return callback({ code: grpc.status.INVALID_ARGUMENT, message: 'schema_name is required.' });
    }
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
    const schemaFile = /^[A-Za-z0-9][A-Za-z0-9._-]*\.schema\.json$/.test(schemaName)
      ? schemaName
      : `${schemaName}.schema.json`;
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]*\.schema\.json$/.test(schemaFile) || path.basename(schemaFile) !== schemaFile) {
      return callback({ code: grpc.status.INVALID_ARGUMENT, message: 'Invalid schema name.' });
    }
    const schemaPath = path.join(SPEC_DIR, schemaFile);
    if (fs.existsSync(schemaPath)) {
      try {
        const content = fs.readFileSync(schemaPath, 'utf8');
        return callback(null, { json_schema: content });
      } catch (err) {
        return callback(null, { json_schema: JSON.stringify({ error: err.message, available: false }) });
      }
    }
    const result = specValidator.validateSpec(schemaFile, {});
    callback(null, { json_schema: JSON.stringify({ schema: result.schema, title: result.title, available: result.available }) });
  }
};
