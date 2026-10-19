'use strict';

const { createHash, createPublicKey, verify } = require('node:crypto');

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function digest(value) {
  return createHash('sha256').update(canonical(value)).digest('hex');
}

function verifyObservationEnvelope(envelope) {
  if (!envelope?.payload || !envelope.publicKey || !envelope.signature) {
    throw new Error('signed-observation-required');
  }
  const payload = envelope.payload;
  if (payload.sourceKind !== 'real_environment' || payload.synthetic !== false) {
    throw new Error('real-observation-required');
  }
  const key = createPublicKey(envelope.publicKey);
  const valid = verify(null, Buffer.from(canonical(payload)), key, Buffer.from(envelope.signature, 'base64'));
  if (!valid) throw new Error('observation-signature-invalid');
  return { payload, signerFingerprint: digest(key.export({ type: 'spki', format: 'der' }).toString('base64')) };
}

function predictionCommitment(prediction) {
  const { predictionId, version, issuedAt, predictionKey, metric, mean, variance,
    confidence, falsificationTolerance, actionRef, trajectoryId, projectId,
    responsibleAgentId, assumptionIds, evidenceRefs } = prediction;
  return digest({ predictionId, version, issuedAt, predictionKey, metric, mean, variance,
    confidence, falsificationTolerance, actionRef, trajectoryId, projectId,
    responsibleAgentId, assumptionIds, evidenceRefs });
}

module.exports = { canonical, digest, predictionCommitment, verifyObservationEnvelope };
