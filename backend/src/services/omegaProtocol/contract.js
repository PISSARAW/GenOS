'use strict';

const Ajv = require('ajv');
const addFormats = require('ajv-formats');
const schema = require('../../../../shared/omegaExecutionProtocol.v1.schema.json');
const { canonicalize, digest } = require('../evidenceProtocol/canonical');
const { OmegaProtocolError } = require('./contractError');
const program = require('./contractProgram');

const PROTOCOL = 'genos.omega.execution/v1';
const MESSAGE_TYPES = Object.freeze([...schema.properties.type.enum]);
const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);
const messageSchema = ajv.compile(schema);

function cloneJson(value) {
  try { return JSON.parse(canonicalize(value)); }
  catch (error) { throw new OmegaProtocolError('OMEGA_JSON_INVALID', error.message); }
}

function timestamp(value) {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new OmegaProtocolError('OMEGA_TIME_INVALID', 'OMEGA timestamp cannot be represented.');
  return parsed;
}

function validateTimes(message, now) {
  const created = timestamp(message.createdAt);
  const expires = timestamp(message.expiresAt);
  const current = typeof now === 'number' ? now : Date.parse(now);
  if (!Number.isFinite(current)) throw new OmegaProtocolError('OMEGA_CLOCK_INVALID', 'OMEGA clock invalid.');
  if (expires <= created) throw new OmegaProtocolError('OMEGA_EXPIRY_INVALID', 'OMEGA expiry must follow creation.');
  if (created > current) throw new OmegaProtocolError('OMEGA_FUTURE', 'OMEGA message is from the future.');
  if (expires <= current) throw new OmegaProtocolError('OMEGA_EXPIRED', 'OMEGA message expired.');
  if (message.type === 'REQUEST_EFFECT') timestamp(message.payload.effect.expiresAt);
}

function validateMessage(input, options = {}) {
  const copy = cloneJson(input);
  if (!messageSchema(copy)) throw new OmegaProtocolError('OMEGA_SCHEMA_INVALID', `OMEGA contract: ${ajv.errorsText(messageSchema.errors)}`);
  validateTimes(copy, options.now ?? Date.now());
  if (copy.payloadDigest !== digest(copy.payload)) throw new OmegaProtocolError('OMEGA_INTEGRITY', 'OMEGA payload digest mismatch.');
  if (copy.type === 'SUBMIT_PROGRAM') program.validateSubmission(copy.payload.submission);
  return copy;
}

function createMessage(fields, options = {}) {
  const copy = cloneJson(fields);
  const payload = cloneJson(copy.payload);
  return validateMessage({ ...copy, protocol: PROTOCOL, payloadDigest: digest(payload) }, options);
}

module.exports = { PROTOCOL, MESSAGE_TYPES, OmegaProtocolError, createMessage, validateMessage, ...program };
