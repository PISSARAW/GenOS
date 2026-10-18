'use strict';

const crypto = require('node:crypto');

const EVIDENCE_SCHEMA = 'genos.evidence-envelope/v1';
const EvidenceState = Object.freeze({
  SYNTHETIC: 'synthetic',
  OBSERVED: 'observed',
  VERIFIED: 'verified',
  REJECTED: 'rejected'
});

const PROMOTIONS = Object.freeze({
  synthetic: new Set(['observed', 'rejected']),
  observed: new Set(['verified', 'rejected']),
  verified: new Set(['rejected']),
  rejected: new Set()
});

function canonicalize(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalize(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function digest(value) {
  return `sha256:${crypto.createHash('sha256').update(canonicalize(value), 'utf8').digest('hex')}`;
}

function assertText(value, field, max = 256) {
  if (typeof value !== 'string' || value.length === 0 || value.length > max) {
    throw new Error(`invalid evidence ${field}`);
  }
}

function validateState(state) {
  if (!Object.values(EvidenceState).includes(state)) throw new Error(`invalid evidence state: ${state}`);
}

function signingPayload(envelope) {
  const { signature, ...unsigned } = envelope;
  return Buffer.from(canonicalize(unsigned), 'utf8');
}

function createEnvelope({ sourceId, captureId, input, output, state = EvidenceState.SYNTHETIC,
  signerId = null, replayKey = null, createdAt = new Date().toISOString(), rejectionReason = null }) {
  assertText(sourceId, 'sourceId');
  assertText(captureId, 'captureId');
  validateState(state);
  if (state === EvidenceState.REJECTED) assertText(rejectionReason, 'rejectionReason');
  const envelope = {
    schema: EVIDENCE_SCHEMA,
    evidenceId: crypto.randomUUID(),
    state,
    sourceId,
    captureId,
    input,
    output,
    inputDigest: digest(input),
    outputDigest: digest(output),
    replayKey: replayKey || digest({ input, recipe: 'unspecified' }),
    createdAt,
    signerId,
    rejectionReason
  };
  validateEnvelope(envelope);
  return envelope;
}

function validateEnvelope(envelope) {
  if (!envelope || envelope.schema !== EVIDENCE_SCHEMA) throw new Error('invalid evidence schema');
  assertText(envelope.evidenceId, 'evidenceId');
  assertText(envelope.sourceId, 'sourceId');
  assertText(envelope.captureId, 'captureId');
  validateState(envelope.state);
  if (envelope.inputDigest !== digest(envelope.input)) throw new Error('evidence input digest mismatch');
  if (envelope.outputDigest !== digest(envelope.output)) throw new Error('evidence output digest mismatch');
  if (envelope.state === EvidenceState.REJECTED) assertText(envelope.rejectionReason, 'rejectionReason');
  if (envelope.state !== EvidenceState.REJECTED && envelope.rejectionReason !== null) {
    throw new Error('non-rejected evidence cannot carry a rejection reason');
  }
  return true;
}

function promoteEnvelope(envelope, targetState, verification = {}) {
  validateEnvelope(envelope);
  validateState(targetState);
  if (!PROMOTIONS[envelope.state].has(targetState)) {
    throw new Error(`invalid evidence promotion ${envelope.state} -> ${targetState}`);
  }
  if (targetState === EvidenceState.VERIFIED) {
    assertText(verification.verifierId, 'verifierId');
    assertText(verification.verificationRef, 'verificationRef');
  }
  const promoted = {
    ...envelope,
    state: targetState,
    signerId: verification.verifierId || envelope.signerId,
    verificationRef: verification.verificationRef || null,
    rejectionReason: targetState === EvidenceState.REJECTED ? verification.rejectionReason : null
  };
  if (targetState === EvidenceState.REJECTED) assertText(promoted.rejectionReason, 'rejectionReason');
  validateEnvelope(promoted);
  return promoted;
}

function signEnvelope(envelope, privateKey, signerId) {
  validateEnvelope(envelope);
  assertText(signerId, 'signerId');
  const unsigned = { ...envelope, signerId, signature: null };
  const signature = crypto.sign(null, signingPayload(unsigned), privateKey).toString('base64');
  return { ...unsigned, signature };
}

function verifyEnvelope(envelope, publicKey) {
  validateEnvelope(envelope);
  assertText(envelope.signerId, 'signerId');
  if (typeof envelope.signature !== 'string' || envelope.signature.length === 0) return false;
  return crypto.verify(null, signingPayload(envelope), publicKey, Buffer.from(envelope.signature, 'base64'));
}

function replayEnvelope(envelope, input, output) {
  validateEnvelope(envelope);
  return envelope.inputDigest === digest(input) && envelope.outputDigest === digest(output);
}

module.exports = {
  EVIDENCE_SCHEMA,
  EvidenceState,
  canonicalize,
  digest,
  createEnvelope,
  validateEnvelope,
  promoteEnvelope,
  signEnvelope,
  verifyEnvelope,
  replayEnvelope
};
