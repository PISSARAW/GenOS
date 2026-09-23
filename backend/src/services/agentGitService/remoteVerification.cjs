'use strict';

const { verifyObjectSignatureLocal, verifyObjectSignatureWithStore, signingAlgorithm } = require('./verifyHelpers.cjs');

function validateRemoteIdAndHash(incoming) {
  const stateHash = incoming?.state_hash || incoming?.stateHash;
  if (!incoming?.id || !stateHash) return { valid: false, error: 'Signed remote object is required.' };
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
  const expected = incoming.state_hash || incoming.stateHash;
  if (actualHash !== expected) return { valid: false, error: 'State hash mismatch: payload does not match the signed stateHash.' };
  return { valid: true };
}

async function validateSignature(incoming, state, ctx = {}) {
  const candidate = {
    ...incoming,
    state_hash: incoming.state_hash || incoming.stateHash,
    state_json: typeof state === 'string' ? state : JSON.stringify(state),
    metadata_json: incoming.metadata_json || '{}'
  };
  if (verifyObjectSignatureLocal(candidate)) return { valid: true };
  if (ctx.db) {
    const trusted = await verifyObjectSignatureWithStore({ db: ctx.db, object: candidate, tenantId: ctx.tenantId });
    if (trusted) return { valid: true };
  }
  return { valid: false, error: 'Remote signature verification failed.' };
}

function parseMetadata(raw) {
  if (!raw) return {};
  if (typeof raw === 'object') return raw;
  try { return JSON.parse(raw); } catch (_) { return null; }
}

function validateTreeAndCommit(ctx) {
  const { incoming, state } = ctx;
  const { treeHash, commitHash } = require('./canonical');
  const parents = incoming.parent_commit_ids || incoming.parentCommitIds || [];
  const metadata = parseMetadata(incoming.metadata_json);
  if (metadata === null) return { valid: false, error: 'Remote metadata_json is not valid JSON.' };
  const expectedTree = treeHash(state);
  const wireTree = incoming.tree_hash || incoming.treeHash;
  if (wireTree && wireTree !== expectedTree) {
    return { valid: false, error: 'Tree hash mismatch: state does not match the signed tree_hash.' };
  }
  const expectedCommit = commitHash({ tree: expectedTree, parents, metadata });
  const wireCommit = incoming.commit_hash || incoming.commitHash;
  if (wireCommit && wireCommit !== expectedCommit) {
    return { valid: false, error: 'Commit hash mismatch: parents/metadata/tree do not match the signed commit_hash.' };
  }
  return { valid: true };
}

function readEnvelope(incoming) {
  const raw = incoming.commit_envelope || incoming.signed_commit_envelope || incoming.signedCommitEnvelope;
  if (!raw) return null;
  return JSON.parse(Buffer.from(raw, 'base64').toString('utf8'));
}

function validateEnvelope(incoming) {
  try {
    const envelope = readEnvelope(incoming);
    if (!envelope) return true;
    if (envelopeCommitMismatch(envelope, incoming)) {
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

function envelopeCommitMismatch(envelope, incoming) {
  const commitHash = incoming.commit_hash || incoming.commitHash;
  const stateHash = incoming.state_hash || incoming.stateHash;
  return envelope.commitHash !== commitHash && envelope.commitHash !== stateHash;
}

async function verifyRemoteObject(incoming, state, ctx = {}) {
  const idCheck = validateRemoteIdAndHash(incoming);
  if (!idCheck.valid) return idCheck;
  const stateCheck = validateRemoteState(state);
  if (!stateCheck.valid) return stateCheck;
  const sigCheck = validateRemoteSignature(incoming);
  if (!sigCheck.valid) return sigCheck;
  const hashCheck = validateStateHashMatch(require('crypto').createHash('sha256').update(JSON.stringify(state)).digest('hex'), incoming);
  if (!hashCheck.valid) return hashCheck;
  const sigVerify = await validateSignature(incoming, state, ctx);
  if (!sigVerify.valid) return sigVerify;
  const treeCheck = validateTreeAndCommit({ incoming, state });
  if (!treeCheck.valid) return treeCheck;
  const envelopeOk = validateEnvelope(incoming);
  if (envelopeOk === false) return envelopeOk;
  return { valid: true, error: null };
}

module.exports = { verifyRemoteObject };
