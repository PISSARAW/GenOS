'use strict';

/**
 * Rust-Node Contract Validator
 * Validates that Rust CLI and Node backend produce compatible outputs per spec/rust-node-contract.schema.json
 */

const fs = require('fs');
const path = require('path');
const Ajv = require('ajv');
const addFormats = require('ajv-formats');

const ajv = new Ajv({ allErrors: true, strict: false, meta: false });
addFormats(ajv);

function getSchemaPath(schemaName) {
  // Try multiple locations
  const candidates = [
    path.resolve(process.cwd(), 'spec', schemaName),
    path.resolve(__dirname, '..', '..', '..', '..', 'spec', schemaName),
    path.resolve(__dirname, '..', '..', 'spec', schemaName),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  throw new Error(`Schema ${schemaName} not found in any known location`);
}

const CONTRACT_SCHEMA = JSON.parse(fs.readFileSync(getSchemaPath('rust-node-contract.schema.json'), 'utf8'));
// Remove $schema to avoid meta-schema resolution issues
delete CONTRACT_SCHEMA.$schema;

const validate = ajv.compile(CONTRACT_SCHEMA);

function validateContract(message) {
  const valid = validate(message);
  return { valid, errors: validate.errors };
}

function validateCommandResponse(response) {
  const message = {
    protocolVersion: 'genos.rust-node/v1',
    messageType: 'COMMAND_RESPONSE',
    correlationId: response.correlationId || 'test-' + Date.now(),
    timestamp: new Date().toISOString(),
    payload: response
  };
  return validateContract(message);
}

function validateSnapshotPayload(snapshot) {
  // Validate against snapshot.schema.json
  const snapshotSchema = JSON.parse(fs.readFileSync(getSchemaPath('snapshot.schema.json'), 'utf8'));
  delete snapshotSchema.$schema;
  const snapshotValidate = ajv.compile(snapshotSchema);
  const valid = snapshotValidate(snapshot);
  return { valid, errors: snapshotValidate.errors };
}

function createTestMessage(type, payload) {
  return {
    protocolVersion: 'genos.rust-node/v1',
    messageType: type,
    correlationId: 'test-' + crypto.randomUUID().slice(0, 8),
    timestamp: new Date().toISOString(),
    payload
  };
}

const crypto = require('crypto');

module.exports = {
  validateContract,
  validateCommandResponse,
  validateSnapshotPayload,
  createTestMessage,
  CONTRACT_SCHEMA
};