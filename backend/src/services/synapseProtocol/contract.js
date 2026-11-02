'use strict';

const Ajv = require('ajv');
const addFormats = require('ajv-formats');
const schema = require('../../../../shared/synapseProtocol.v1.schema.json');
const { canonicalize, digest } = require('../evidenceProtocol/canonical');
const { SynapseProtocolError } = require('./contractError');

const PROTOCOL = 'genos.synapse/v1';
const MESSAGE_TYPES = Object.freeze([...schema.properties.type.enum]);
const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);
const messageSchema = ajv.compile(schema);
const definition = name => ajv.compile({ $ref: `#/definitions/${name}`, definitions: schema.definitions });
const contextSchema = definition('context');
const deltaSchema = definition('delta');
const stateSchema = definition('state');
const representationSchema = definition('representation');

function cloneJson(value) {
  try { return JSON.parse(canonicalize(value)); }
  catch (error) { throw new SynapseProtocolError('SYNAPSE_JSON_INVALID', error.message); }
}

function checked(value, validator) {
  const copy = cloneJson(value);
  if (!validator(copy)) throw new SynapseProtocolError('SYNAPSE_SCHEMA_INVALID', `SYNAPSE contract: ${ajv.errorsText(validator.errors)}`);
  return copy;
}

function validateContext(input) {
  const context = checked(input, contextSchema);
  const dictionary = context.dictionary;
  if ((dictionary.snapshot === null) !== (dictionary.digest === null)) throw new SynapseProtocolError('SYNAPSE_CONTEXT_INVALID', 'SYNAPSE missing dictionary snapshot/digest must agree.');
  if (dictionary.snapshot && digest(dictionary.snapshot) !== dictionary.digest) throw new SynapseProtocolError('SYNAPSE_INTEGRITY', 'SYNAPSE complete dictionary digest mismatch.');
  if (dictionary.snapshot) validateDictionaryBinding(context);
  const ids = context.dependencies.map(item => item.dependencyId);
  if (new Set(ids).size !== ids.length) throw new SynapseProtocolError('SYNAPSE_CONTEXT_INVALID', 'SYNAPSE duplicate dependency identity.');
  if (context.publisher.agentId === context.audience[0].agentId) throw new SynapseProtocolError('SYNAPSE_CONTEXT_INVALID', 'SYNAPSE distinct logical participants required.');
  return context;
}

function validateDictionaryBinding(context) {
  const snapshot = context.dictionary.snapshot;
  const pair = [context.publisher.agentId, context.audience[0].agentId].sort();
  if (snapshot.domain !== context.domain || digest(snapshot.participants) !== digest(pair)) {
    throw new SynapseProtocolError('SYNAPSE_CONTEXT_INVALID', 'SYNAPSE dictionary domain or participants mismatch.');
  }
}

function validateDelta(delta) { return checked(delta, deltaSchema); }
function validateRepresentation(representation) {
  const copy = checked(representation, representationSchema);
  if (Buffer.byteLength(canonicalize(copy), 'utf8') > 2 * 1024 * 1024) throw new SynapseProtocolError('SYNAPSE_REPRESENTATION_INVALID', 'SYNAPSE representation exceeds 2 MiB.');
  return copy;
}

function validateState(state) {
  const copy = checked(state, stateSchema);
  if (Buffer.byteLength(canonicalize(copy), 'utf8') > 1024 * 1024) throw new SynapseProtocolError('SYNAPSE_STATE_INVALID', 'SYNAPSE state exceeds 1 MiB.');
  return copy;
}

function timestamp(value) {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new SynapseProtocolError('SYNAPSE_TIME_INVALID', 'SYNAPSE timestamp cannot be represented.');
  return parsed;
}

function validateTimes(message, now) {
  const created = timestamp(message.createdAt);
  const expires = timestamp(message.expiresAt);
  const current = typeof now === 'number' ? now : Date.parse(now);
  if (!Number.isFinite(current)) throw new SynapseProtocolError('SYNAPSE_CLOCK_INVALID', 'SYNAPSE clock invalid.');
  if (expires <= created) throw new SynapseProtocolError('SYNAPSE_EXPIRY_INVALID', 'SYNAPSE expiry must follow creation.');
  if (created > current) throw new SynapseProtocolError('SYNAPSE_FUTURE', 'SYNAPSE message is from the future.');
  if (expires <= current) throw new SynapseProtocolError('SYNAPSE_EXPIRED', 'SYNAPSE message expired.');
}

function validateMessage(input, options = {}) {
  const message = checked(input, messageSchema);
  validateTimes(message, options.now ?? Date.now());
  if (message.payloadDigest !== digest(message.payload)) throw new SynapseProtocolError('SYNAPSE_INTEGRITY', 'SYNAPSE payload digest mismatch.');
  if (message.type === 'DECLARE_CONTEXT') validateContext(message.payload.context);
  if (['OFFER_DELTA', 'APPLY_DELTA'].includes(message.type)) validateRepresentation(message.payload.representation);
  return message;
}

function createMessage(fields, options = {}) {
  const copy = cloneJson(fields);
  const payload = cloneJson(copy.payload);
  return validateMessage({ ...copy, protocol: PROTOCOL, payloadDigest: digest(payload) }, options);
}

module.exports = { PROTOCOL, MESSAGE_TYPES, SynapseProtocolError, createMessage, validateMessage,
  validateContext, validateDelta, validateRepresentation, validateState };
