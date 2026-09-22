'use strict';

const { verifyObjectSignatureLocal, signingAlgorithm } = require('./verifyHelpers.cjs');

function validateRemoteIdAndHash(incoming) {
  if (!incoming?.id || !incoming.stateHash) return { valid: false, error: 'Signed remote object is required.' };
  return { valid: true };
}

function validateRemoteState(state) {
  if (!state) return { valid: false, error: 'Remote state payload is required.' };
  return { valid: true };
}

function validateRemoteSignature(incoming) {
  if (!incoming.signature) return { valid: false, error: 'Remote signature is required (unsigned remote objects are rejected).' };
  return { valid: true };
}

function validateStateHashMatch(actualHash, incoming) {
  if (actualHash !== incoming.stateHash) return { valid: false, error: 'State hash mismatch: payload does not match the signed stateHash.' };
  return { valid: true };
}

function validateSignature(incoming, state) {
  if (!verifyObjectSignatureLocal({ ...incoming, state_hash: incoming.stateHash, state_json: state, metadata_json: '{}' })) {
    return { valid: false, error: 'Remote signature verification failed.' };
  }
  return { valid: true };
}

function validateEnvelope(incoming) {
  if (!incoming.signedCommitEnvelope) return true;
  try {
    const envelope = JSON.parse(Buffer.from(incoming.signedCommitEnvelope, 'base64').toString('utf8'));
    if (envelope.commitHash !== incoming.commitHash && envelope.commitHash !== incoming.stateHash) {
      return { valid: false, error: 'Envelope commit hash mismatch.' };
    }
    if (envelope.algorithm && envelope.algorithm !== (incoming.signature_algorithm || signingAlgorithm())) {
      return { valid: false, error: 'Envelope algorithm mismatch.' };
    }
  } catch (_) {
    return { valid: false, error: 'Invalid signed commit envelope.' };
  }
  return true;
}

async function verifyRemoteObject(incoming, state) {
  const idCheck = validateRemoteIdAndHash(incoming);
  if (!idCheck.valid) return idCheck;
  const stateCheck = validateRemoteState(state);
  if (!stateCheck.valid) return stateCheck;
  const sigCheck = validateRemoteSignature(incoming);
  if (!sigCheck.valid) return sigCheck;
  const hashCheck = validateStateHashMatch(require('crypto').createHash('sha256').update(JSON.stringify(state)).digest('hex'), incoming);
  if (!hashCheck.valid) return hashCheck;
  const sigVerify = validateSignature(incoming, state);
  if (!sigVerify.valid) return sigVerify;
  const envelopeOk = validateEnvelope(incoming);
  if (envelopeOk === false) return envelopeOk;
  return { valid: true, error: null };
}

module.exports = { verifyRemoteObject };
