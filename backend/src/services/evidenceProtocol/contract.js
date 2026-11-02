'use strict';

const Ajv = require('ajv');
const addFormats = require('ajv-formats');
const schema = require('../../../../shared/evidenceProtocol.v1.schema.json');
const { canonicalize, digest } = require('./canonical');

const PROTOCOL = 'genos.evidence/v1';
const MESSAGE_TYPES = Object.freeze([...schema.properties.type.enum]);
const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);
const messageSchema = ajv.compile(schema);
const claimSchema = ajv.compile({
  $ref: '#/definitions/claim', definitions: schema.definitions,
});

class EvidenceProtocolError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'EvidenceProtocolError';
    this.code = code;
  }
}

function cloneJson(value) {
  try { return JSON.parse(canonicalize(value)); }
  catch (error) { throw new EvidenceProtocolError('EVIDENCE_JSON_INVALID', error.message); }
}

function validatedCopy(value, validator) {
  const copy = cloneJson(value);
  if (!validator(copy)) {
    throw new EvidenceProtocolError('EVIDENCE_SCHEMA_INVALID', `EVIDENCE contract: ${ajv.errorsText(validator.errors)}`);
  }
  return copy;
}

function validateClaim(claim) {
  return validatedCopy(claim, claimSchema);
}

function validateTimes(message, now) {
  const created = Date.parse(message.createdAt);
  const expires = Date.parse(message.expiresAt);
  const current = typeof now === 'number' ? now : Date.parse(now);
  if (!Number.isFinite(created) || !Number.isFinite(expires)) {
    throw new EvidenceProtocolError('EVIDENCE_TIME_INVALID', 'EVIDENCE timestamps must be representable by the runtime.');
  }
  if (!Number.isFinite(current)) throw new EvidenceProtocolError('EVIDENCE_CLOCK_INVALID', 'EVIDENCE clock must be valid.');
  if (expires <= created) throw new EvidenceProtocolError('EVIDENCE_EXPIRY_INVALID', 'EVIDENCE expiry must follow creation.');
  if (created > current) throw new EvidenceProtocolError('EVIDENCE_FUTURE', 'EVIDENCE message is from the future.');
  if (expires <= current) throw new EvidenceProtocolError('EVIDENCE_EXPIRED', 'EVIDENCE message expired.');
}

function validateMessage(message, options = {}) {
  const copy = validatedCopy(message, messageSchema);
  validateTimes(copy, options.now ?? Date.now());
  if (copy.payloadDigest !== digest(copy.payload)) {
    throw new EvidenceProtocolError('EVIDENCE_INTEGRITY', 'EVIDENCE payload digest mismatch.');
  }
  return copy;
}

function createMessage(fields, options = {}) {
  const copy = cloneJson(fields);
  const payload = cloneJson(copy.payload);
  return validateMessage({ ...copy, protocol: PROTOCOL, payloadDigest: digest(payload) }, options);
}

module.exports = { PROTOCOL, MESSAGE_TYPES, EvidenceProtocolError, createMessage, validateMessage, validateClaim };
