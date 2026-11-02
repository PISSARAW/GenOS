'use strict';

const Ajv = require('ajv');
const addFormats = require('ajv-formats');
const schema = require('../../../../shared/gqwfExchangeProtocol.v1.schema.json');
const { canonicalize, digest } = require('../evidenceProtocol/canonical');
const { GqwfExchangeError } = require('./contractError');

const PROTOCOL = 'genos.gqwf.exchange/v1';
const MESSAGE_TYPES = Object.freeze([...schema.properties.type.enum]);
const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);
const messageSchema = ajv.compile(schema);
const definition = (name) => ajv.compile({ $ref: `#/definitions/${name}`, definitions: schema.definitions });
const worldSchema = definition('world');
const candidateSchema = definition('candidate');
const qualificationPolicySchema = definition('qualificationPolicy');

function cloneJson(value) {
  try { return JSON.parse(canonicalize(value)); }
  catch (error) { throw new GqwfExchangeError('GQWF_EXCHANGE_JSON_INVALID', error.message); }
}

function checked(value, validator) {
  const copy = cloneJson(value);
  if (!validator(copy)) throw new GqwfExchangeError('GQWF_EXCHANGE_SCHEMA_INVALID', `GQWF Exchange contract: ${ajv.errorsText(validator.errors)}`);
  return copy;
}

function validateWorldShape(world) { return checked(world, worldSchema); }
function validateCandidate(candidate) { return checked(candidate, candidateSchema); }
function validateQualificationPolicy(policy) { return checked(policy, qualificationPolicySchema); }

function timestamp(value) {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new GqwfExchangeError('GQWF_EXCHANGE_TIME_INVALID', 'GQWF Exchange timestamp cannot be represented.');
  return parsed;
}

function validateTimes(message, now) {
  const created = timestamp(message.createdAt);
  const expires = timestamp(message.expiresAt);
  const current = typeof now === 'number' ? now : Date.parse(now);
  if (!Number.isFinite(current)) throw new GqwfExchangeError('GQWF_EXCHANGE_CLOCK_INVALID', 'GQWF Exchange clock invalid.');
  if (expires <= created) throw new GqwfExchangeError('GQWF_EXCHANGE_EXPIRY_INVALID', 'GQWF Exchange expiry must follow creation.');
  if (created > current) throw new GqwfExchangeError('GQWF_EXCHANGE_FUTURE', 'GQWF Exchange message is from the future.');
  if (expires <= current) throw new GqwfExchangeError('GQWF_EXCHANGE_EXPIRED', 'GQWF Exchange message expired.');
}

function validateMessage(input, options = {}) {
  const message = checked(input, messageSchema);
  validateTimes(message, options.now ?? Date.now());
  if (message.payloadDigest !== digest(message.payload)) throw new GqwfExchangeError('GQWF_EXCHANGE_INTEGRITY', 'GQWF Exchange payload digest mismatch.');
  if (message.type === 'TRANSFER') {
    const bytes = Buffer.from(message.payload.bytesBase64, 'base64');
    if (bytes.toString('base64') !== message.payload.bytesBase64 || bytes.length > 8 * 1024 * 1024) {
      throw new GqwfExchangeError('GQWF_EXCHANGE_TRANSFER_INVALID', 'GQWF Exchange requires canonical base64 within 8 MiB.');
    }
  }
  return message;
}

function createMessage(fields, options = {}) {
  const copy = cloneJson(fields);
  const payload = cloneJson(copy.payload);
  return validateMessage({ ...copy, protocol: PROTOCOL, payloadDigest: digest(payload) }, options);
}

module.exports = { PROTOCOL, MESSAGE_TYPES, GqwfExchangeError, createMessage, validateMessage,
  validateWorldShape, validateCandidate, validateQualificationPolicy };
