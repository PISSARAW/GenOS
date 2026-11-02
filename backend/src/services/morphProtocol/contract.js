'use strict';

const Ajv = require('ajv');
const addFormats = require('ajv-formats');
const schema = require('../../../../shared/morphProtocol.v1.schema.json');
const { canonicalize, digest } = require('../evidenceProtocol/canonical');

const PROTOCOL = 'genos.morph/v1';
const MESSAGE_TYPES = Object.freeze([...schema.properties.type.enum]);
const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);
const messageSchema = ajv.compile(schema);
const definition = (name) => ajv.compile({ $ref: `#/definitions/${name}`, definitions: schema.definitions });
const planSchema = definition('plan');
const snapshotSchema = definition('snapshot');

class MorphProtocolError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'MorphProtocolError';
    this.code = code;
  }
}

function cloneJson(value) {
  try { return JSON.parse(canonicalize(value)); }
  catch (error) { throw new MorphProtocolError('MORPH_JSON_INVALID', error.message); }
}

function validatedCopy(value, validator) {
  const copy = cloneJson(value);
  if (!validator(copy)) throw new MorphProtocolError('MORPH_SCHEMA_INVALID', `MORPH contract: ${ajv.errorsText(validator.errors)}`);
  return copy;
}

function validatePlan(plan) { return validatedCopy(plan, planSchema); }
function validateSnapshot(snapshot) { return validatedCopy(snapshot, snapshotSchema); }

function timestamp(value) {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new MorphProtocolError('MORPH_TIME_INVALID', 'MORPH timestamp cannot be represented.');
  return parsed;
}

function validateTimes(message, now) {
  const created = timestamp(message.createdAt);
  const expires = timestamp(message.expiresAt);
  const current = typeof now === 'number' ? now : Date.parse(now);
  if (!Number.isFinite(current)) throw new MorphProtocolError('MORPH_CLOCK_INVALID', 'MORPH clock invalid.');
  if (expires <= created) throw new MorphProtocolError('MORPH_EXPIRY_INVALID', 'MORPH expiry must follow creation.');
  if (created > current) throw new MorphProtocolError('MORPH_FUTURE', 'MORPH message is from the future.');
  if (expires <= current) throw new MorphProtocolError('MORPH_EXPIRED', 'MORPH message expired.');
}

function validateMessage(message, options = {}) {
  const copy = validatedCopy(message, messageSchema);
  validateTimes(copy, options.now ?? Date.now());
  if (copy.payloadDigest !== digest(copy.payload)) throw new MorphProtocolError('MORPH_INTEGRITY', 'MORPH payload digest mismatch.');
  return copy;
}

function createMessage(fields, options = {}) {
  const copy = cloneJson(fields);
  const payload = cloneJson(copy.payload);
  return validateMessage({ ...copy, protocol: PROTOCOL, payloadDigest: digest(payload) }, options);
}

module.exports = { PROTOCOL, MESSAGE_TYPES, MorphProtocolError, createMessage, validateMessage, validatePlan, validateSnapshot };
