'use strict';

const Ajv = require('ajv');
const addFormats = require('ajv-formats');
const schema = require('../../../../shared/continuityProtocol.v1.schema.json');
const { canonicalize, digest } = require('../evidenceProtocol/canonical');

const PROTOCOL = 'genos.continuity/v1';
const MESSAGE_TYPES = Object.freeze([...schema.properties.type.enum]);
const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);
const messageSchema = ajv.compile(schema);
const definition = (name) => ajv.compile({ $ref: `#/definitions/${name}`, definitions: schema.definitions });
const identitySchema = definition('identity');
const bundleSchema = definition('bundle');

class ContinuityProtocolError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'ContinuityProtocolError';
    this.code = code;
  }
}

function cloneJson(value) {
  try { return JSON.parse(canonicalize(value)); }
  catch (error) { throw new ContinuityProtocolError('CONTINUITY_JSON_INVALID', error.message); }
}

function validatedCopy(value, validator) {
  const copy = cloneJson(value);
  if (!validator(copy)) {
    throw new ContinuityProtocolError('CONTINUITY_SCHEMA_INVALID', `CONTINUITY contract: ${ajv.errorsText(validator.errors)}`);
  }
  return copy;
}

function validateIdentity(identity) { return validatedCopy(identity, identitySchema); }

function uniqueIds(items, key) {
  const ids = items.map((item) => item[key]);
  if (new Set(ids).size !== ids.length) {
    throw new ContinuityProtocolError('CONTINUITY_BUNDLE_INVALID', `CONTINUITY duplicate ${key}.`);
  }
}

function evidenceCoverage(bundle) {
  const references = new Set(bundle.evidenceRefs);
  const missing = bundle.obligations.some((item) => item.evidenceRefs.some((reference) => !references.has(reference)));
  if (missing) throw new ContinuityProtocolError('CONTINUITY_BUNDLE_INVALID', 'CONTINUITY obligation evidence missing from bundle inventory.');
}

function validateBundle(bundle) {
  const copy = validatedCopy(bundle, bundleSchema);
  uniqueIds(copy.obligations, 'obligationId');
  uniqueIds(copy.unknownEffects, 'effectId');
  evidenceCoverage(copy);
  const { limit, spent, reserved } = copy.budget;
  if (reserved > limit || spent > limit - reserved) {
    throw new ContinuityProtocolError('CONTINUITY_BUNDLE_INVALID', 'CONTINUITY budget exceeds its limit.');
  }
  return copy;
}

function timestamp(value) {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new ContinuityProtocolError('CONTINUITY_TIME_INVALID', 'CONTINUITY timestamp cannot be represented.');
  return parsed;
}

function validateTimes(message, now) {
  const created = timestamp(message.createdAt);
  const expires = timestamp(message.expiresAt);
  const current = typeof now === 'number' ? now : Date.parse(now);
  if (!Number.isFinite(current)) throw new ContinuityProtocolError('CONTINUITY_CLOCK_INVALID', 'CONTINUITY clock invalid.');
  if (expires <= created) throw new ContinuityProtocolError('CONTINUITY_EXPIRY_INVALID', 'CONTINUITY expiry must follow creation.');
  if (created > current) throw new ContinuityProtocolError('CONTINUITY_FUTURE', 'CONTINUITY message is from the future.');
  if (expires <= current) throw new ContinuityProtocolError('CONTINUITY_EXPIRED', 'CONTINUITY message expired.');
  if (message.type === 'CHALLENGE') timestamp(message.payload.challengeExpiresAt);
}

function validateMessage(message, options = {}) {
  const copy = validatedCopy(message, messageSchema);
  validateTimes(copy, options.now ?? Date.now());
  if (copy.type === 'OFFER_HANDOFF') validateBundle(copy.payload.bundle);
  if (copy.payloadDigest !== digest(copy.payload)) {
    throw new ContinuityProtocolError('CONTINUITY_INTEGRITY', 'CONTINUITY payload digest mismatch.');
  }
  return copy;
}

function createMessage(fields, options = {}) {
  const copy = cloneJson(fields);
  const payload = cloneJson(copy.payload);
  return validateMessage({ ...copy, protocol: PROTOCOL, payloadDigest: digest(payload) }, options);
}

module.exports = { PROTOCOL, MESSAGE_TYPES, ContinuityProtocolError, createMessage, validateMessage, validateIdentity, validateBundle };
