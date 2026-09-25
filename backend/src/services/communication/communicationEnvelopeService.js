'use strict';

const crypto = require('crypto');

const ENVELOPE_VERSION = 1;
const MODALITIES = new Set(['text', 'structured', 'ligand', 'voltage', 'pheromone', 'plasmid', 'tensor']);
const GROUNDING_LEVELS = new Set([
  'none', 'transport_ack', 'semantic_ack', 'action_ack', 'verified_ack', 'human_confirmation'
]);

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== 'object') return value;
  return Object.keys(value).sort().reduce((result, key) => {
    result[key] = stableValue(value[key]);
    return result;
  }, {});
}

function digestPayload(payload) {
  const canonical = JSON.stringify(stableValue(payload === undefined ? null : payload));
  return `sha256:${crypto.createHash('sha256').update(canonical).digest('hex')}`;
}

function expiresAtOf(ttlMs, createdAt) {
  if (ttlMs === null || ttlMs === undefined) return null;
  const duration = Number(ttlMs);
  if (!Number.isFinite(duration) || duration < 0) throw new Error('ttlMs must be a non-negative finite number.');
  return new Date(Date.parse(createdAt) + duration).toISOString();
}

function stringList(value, field) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string' || !item.trim())) {
    throw new Error(`${field} must be an array of non-empty strings.`);
  }
  return [...new Set(value)];
}

function prepareEnvelopeInput(input) {
  if (!input || typeof input !== 'object') throw new Error('Communication envelope input is required.');
  if (!['signal', 'organization_message'].includes(input.kind)) throw new Error('Unsupported communication envelope kind.');
  if (!MODALITIES.has(input.modality)) throw new Error('Unsupported communication envelope modality.');
  const createdAt = input.createdAt || new Date().toISOString();
  if (Number.isNaN(Date.parse(createdAt))) throw new Error('createdAt must be an ISO date-time.');
  const recipients = stringList(input.recipientAgentIds || [], 'recipientAgentIds');
  const groundingRequired = input.groundingRequired || 'none';
  if (!GROUNDING_LEVELS.has(groundingRequired)) throw new Error('Unsupported grounding requirement.');
  return { input, createdAt, recipients, groundingRequired };
}

function assembleEnvelope(prepared) {
  const { input, createdAt, recipients, groundingRequired } = prepared;
  return {
    version: ENVELOPE_VERSION,
    messageId: input.messageId || `comm_${crypto.randomUUID()}`,
    kind: input.kind,
    senderAgentId: input.senderAgentId || null,
    recipientMode: recipients.length ? 'targeted' : 'routed',
    recipientAgentIds: recipients,
    channel: String(input.channel || input.kind),
    modality: input.modality,
    semanticRefs: stringList(input.semanticRefs || [], 'semanticRefs'),
    artifactRefs: stringList(input.artifactRefs || [], 'artifactRefs'),
    scope: input.scope || null,
    createdAt,
    expiresAt: expiresAtOf(input.ttlMs, createdAt),
    groundingRequired,
    payloadDigest: digestPayload(input.payload)
  };
}

function createEnvelope(input) {
  const envelope = assembleEnvelope(prepareEnvelopeInput(input));
  const validation = validateEnvelope(envelope);
  if (!validation.valid) throw new Error(`Invalid communication envelope: ${validation.errors.join(' ')}`);
  return envelope;
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function nonEmptyStringArray(value) {
  return Array.isArray(value) && value.every(isNonEmptyString);
}

function validateCoreIdentity(envelope, errors) {
  if (envelope.version !== ENVELOPE_VERSION) errors.push('Unsupported envelope version.');
  if (typeof envelope.messageId !== 'string' || !envelope.messageId) errors.push('messageId is required.');
  if (!['signal', 'organization_message'].includes(envelope.kind)) errors.push('Unsupported kind.');
  if (!MODALITIES.has(envelope.modality)) errors.push('Unsupported modality.');
}

function validateAddress(envelope, errors) {
  if (!['targeted', 'routed'].includes(envelope.recipientMode)) errors.push('Unsupported recipientMode.');
  if (envelope.recipientMode === 'targeted' && (!Array.isArray(envelope.recipientAgentIds) || envelope.recipientAgentIds.length === 0)) errors.push('Targeted envelopes require recipients.');
}

function validateSenderAndChannel(envelope, errors) {
  if (typeof envelope.senderAgentId !== 'string' && envelope.senderAgentId !== null) errors.push('senderAgentId must be a string or null.');
  if (typeof envelope.channel !== 'string' || !envelope.channel || envelope.channel.length > 64) errors.push('channel must contain 1 to 64 characters.');
}

function validateIdentity(envelope, errors) {
  validateCoreIdentity(envelope, errors);
  validateAddress(envelope, errors);
  validateSenderAndChannel(envelope, errors);
}

function validateReferences(envelope, errors) {
  if (!nonEmptyStringArray(envelope.recipientAgentIds)) errors.push('recipientAgentIds must contain non-empty strings.');
  if (!nonEmptyStringArray(envelope.semanticRefs) || !nonEmptyStringArray(envelope.artifactRefs)) errors.push('Reference collections must contain non-empty strings.');
  if (envelope.scope !== null && (typeof envelope.scope !== 'object' || Array.isArray(envelope.scope))) errors.push('scope must be an object or null.');
}

function validateGrounding(envelope, errors) {
  if (!GROUNDING_LEVELS.has(envelope.groundingRequired)) errors.push('Unsupported grounding requirement.');
  if (typeof envelope.payloadDigest !== 'string' || !/^sha256:[a-f0-9]{64}$/.test(envelope.payloadDigest)) errors.push('payloadDigest must be a SHA-256 digest.');
  if (Number.isNaN(Date.parse(envelope.createdAt || ''))) errors.push('createdAt must be a date-time.');
  if (envelope.expiresAt !== null && Number.isNaN(Date.parse(envelope.expiresAt || ''))) errors.push('expiresAt must be a date-time or null.');
}

function validateEnvelope(envelope) {
  if (!envelope || typeof envelope !== 'object') return { valid: false, errors: ['Envelope is required.'] };
  const errors = [];
  validateIdentity(envelope, errors);
  validateReferences(envelope, errors);
  validateGrounding(envelope, errors);
  return { valid: errors.length === 0, errors };
}

function verifyEnvelopePayload(envelope, payload) {
  const validation = validateEnvelope(envelope);
  if (!validation.valid) return { valid: false, reason: 'invalid_envelope', errors: validation.errors };
  const digestMatches = digestPayload(payload) === envelope.payloadDigest;
  return { valid: digestMatches, reason: digestMatches ? null : 'payload_digest_mismatch', errors: [] };
}

module.exports = { ENVELOPE_VERSION, createEnvelope, validateEnvelope, digestPayload, verifyEnvelopePayload };
