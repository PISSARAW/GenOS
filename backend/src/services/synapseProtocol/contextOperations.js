'use strict';

const Ajv = require('ajv');
const addFormats = require('ajv-formats');
const { canonicalize, digest } = require('../evidenceProtocol/canonical');
const { validateRepresentation, validateState, SynapseProtocolError } = require('./contract');

const fail = message => { throw new SynapseProtocolError('SYNAPSE_DELTA_INVALID', message); };
const copy = value => JSON.parse(canonicalize(value));

function normalizeOperations(operations) {
  const normalized = validateRepresentation({ encoding: 'canonical', operations }).operations;
  const keys = normalized.map(operation => operation.key);
  if (new Set(keys).size !== keys.length) fail('SYNAPSE one operation per key is required.');
  return normalized;
}

function applyOperations(operations, state) {
  const value = validateState(state);
  for (const operation of normalizeOperations(operations)) {
    if (operation.kind === 'put') value[operation.key] = operation.value;
    else {
      if (!Object.hasOwn(value, operation.key)) fail('SYNAPSE remove targets an absent key.');
      delete value[operation.key];
    }
  }
  return validateState(value);
}

function validateConfiguration(config) {
  if (!config.schema?.definition || !Array.isArray(config.operations) || config.operations.length !== 2) fail('SYNAPSE local schema and two operation mappings required.');
  if (!Object.keys(config.groundingProvenance).length) fail('SYNAPSE grounding provenance contract cannot be empty.');
  if (!Number.isFinite(config.minimumGroundConfidence) || config.minimumGroundConfidence < 0 || config.minimumGroundConfidence > 1) fail('SYNAPSE grounding confidence bound invalid.');
}

function compileMappings(config, ajv) {
  const mappings = new Map();
  for (const entry of config.operations) {
    if (!['put', 'remove'].includes(entry.kind) || mappings.has(entry.kind)) fail('SYNAPSE exactly one local mapping for put and remove required.');
    if (!/^sha256:[a-f0-9]{64}$/.test(entry.semanticFingerprint) || !entry.canonicalMeaning || !entry.payloadSchema) fail('SYNAPSE semantic mapping is incomplete.');
    mappings.set(entry.kind, { ...entry, validate: ajv.compile(entry.payloadSchema) });
  }
  if (new Set(config.operations.map(entry => entry.semanticFingerprint)).size !== 2) fail('SYNAPSE distinct semantic fingerprints required.');
  return mappings;
}

function compileConfiguration(options) {
  const config = copy({ schema: options.schema, operations: options.operations,
    groundingProvenance: options.groundingProvenance || { kind: 'synapse-context/v1', strength: 'configured' },
    minimumGroundConfidence: options.minimumGroundConfidence ?? 0.5 });
  validateConfiguration(config);
  const ajv = new Ajv({ strict: false, allErrors: true });
  addFormats(ajv);
  return { config, mappings: compileMappings(config, ajv), stateValidator: ajv.compile(config.schema.definition),
    schemaRef: { schemaId: config.schema.schemaId, version: config.schema.version, digest: digest(config.schema.definition) } };
}

function validateConfiguredState(state, configuration) {
  const value = validateState(state);
  if (!configuration.stateValidator(value)) fail('SYNAPSE state does not satisfy the locally installed schema.');
  return value;
}

function operationPayload(operation) {
  return operation.kind === 'put' ? { key: operation.key, value: operation.value } : { key: operation.key };
}

function validateOperationPayload(operation, mapping) {
  const payload = operationPayload(operation);
  if (!mapping.validate(payload)) fail('SYNAPSE payload does not satisfy the locally installed operation schema.');
  return payload;
}

function payloadOperation(mapping, payload) {
  const expected = mapping.kind === 'put' ? ['key', 'value'] : ['key'];
  const actual = Object.keys(payload);
  if (actual.length !== expected.length || actual.some(key => !expected.includes(key))) fail('SYNAPSE encoded payload contains unsupported fields.');
  return mapping.kind === 'put' ? { kind: 'put', key: payload.key, value: payload.value }
    : { kind: 'remove', key: payload.key };
}

module.exports = { fail, copy, normalizeOperations, applyOperations, compileConfiguration,
  validateConfiguredState, operationPayload, validateOperationPayload, payloadOperation };
