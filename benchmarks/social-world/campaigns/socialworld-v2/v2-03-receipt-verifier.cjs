'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const SIGNED_FIELDS = Object.freeze(['issuer', 'seed', 'eventId', 'actorId', 'recipientId',
  'domain', 'observedAt', 'sourceArtifact', 'sourceDigest']);

function digest(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function canonicalPayload(receipt) {
  return JSON.stringify(Object.fromEntries(SIGNED_FIELDS.map((field) => [field, receipt[field]])));
}

function keyFingerprint(publicKey) {
  const key = publicKey?.type === 'public' ? publicKey : crypto.createPublicKey(publicKey);
  const encoded = key.export({ type: 'spki', format: 'der' });
  return digest(encoded);
}

function loadTrust(trustFilePath) {
  if (typeof trustFilePath !== 'string' || !path.isAbsolute(trustFilePath)) {
    throw new Error('V2-03 requires an absolute external trust-file path.');
  }
  const trust = JSON.parse(fs.readFileSync(trustFilePath, 'utf8'));
  if (!validTrustFields(trust)) throw new Error('V2-03 trust file is incomplete.');
  const fingerprint = keyFingerprint(trust.publicKeyPem);
  if (fingerprint !== trust.fingerprint.toLowerCase()) throw new Error('V2-03 verifier key does not match its pinned fingerprint.');
  if (crypto.createPublicKey(trust.publicKeyPem).asymmetricKeyType !== 'ed25519') {
    throw new Error('V2-03 verifier key must be Ed25519.');
  }
  return { ...trust, fingerprint };
}

function validTrustFields(trust) {
  return typeof trust.issuer === 'string' && Boolean(trust.issuer.trim())
    && typeof trust.publicKeyPem === 'string' && Boolean(trust.publicKeyPem.trim())
    && /^[a-f0-9]{64}$/i.test(trust.fingerprint || '');
}

function sourcePath(bundlePath, reference) {
  if (typeof reference !== 'string' || !reference.trim() || path.isAbsolute(reference)
    || path.win32.isAbsolute(reference) || reference.split(/[\\/]/).includes('..')) {
    throw new Error('V2-03 source artifact reference escapes the bundle.');
  }
  const root = fs.realpathSync(path.dirname(bundlePath));
  const target = fs.realpathSync(path.resolve(root, reference));
  if (!target.startsWith(`${root}${path.sep}`) || !fs.statSync(target).isFile()) {
    throw new Error('V2-03 source artifact is outside the bundle.');
  }
  return target;
}

function verifiedArtifact(receipt, bundlePath) {
  const filename = sourcePath(bundlePath, receipt.sourceArtifact);
  const bytes = fs.readFileSync(filename);
  if (!/^[a-f0-9]{64}$/i.test(receipt.sourceDigest || '')
    || digest(bytes) !== receipt.sourceDigest.toLowerCase()) throw new Error('V2-03 source artifact digest mismatch.');
  const artifact = JSON.parse(bytes.toString('utf8'));
  if (!artifactMatches(artifact, receipt)) throw new Error('V2-03 source artifact has no matching delivery receipt.');
  return { path: filename, digest: receipt.sourceDigest.toLowerCase() };
}

function validSignalId(value) {
  return Boolean(typeof value === 'string' && value)
    || Number.isSafeInteger(value) && value > 0;
}

function artifactMatches(artifact, receipt) {
  const fields = ['eventId', 'seed', 'actorId', 'recipientId', 'domain'];
  const delivery = artifact.deliveryReceipt;
  return fields.every((field) => artifact[field] === receipt[field])
    && artifact.status === 'delivered' && delivery?.recipientAgentId === receipt.recipientId
    && delivery.status === 'delivered' && delivery.integrityStatus === 'verified'
    && delivery.sourceRef === `event:${receipt.eventId}` && validSignalId(delivery.signalId);
}

function verifyOne(input) {
  const { receipt, trust, bundlePath, seed, recipientId } = input;
  if (!validReceiptScope(input)) throw new Error('V2-03 receipt identity or scope mismatch.');
  if (!signatureValid(receipt, trust)) throw new Error('V2-03 receipt signature is invalid.');
  const artifact = verifiedArtifact(receipt, bundlePath);
  return { receipt, verification: { accepted: true, signatureVerified: true,
    verifierKeyFingerprint: trust.fingerprint, issuer: trust.issuer,
    receiptDigest: digest(`${canonicalPayload(receipt)}:${receipt.signature}`), sourceDigest: artifact.digest },
  sourceArtifactPath: artifact.path };
}

function validReceiptScope(input) {
  const { receipt, trust, seed, recipientId } = input;
  return receipt?.issuer === trust.issuer && receipt.seed === seed && receipt.recipientId === recipientId
    && receipt.domain === 'social_help' && typeof receipt.eventId === 'string' && Boolean(receipt.eventId)
    && typeof receipt.actorId === 'string' && Boolean(receipt.actorId)
    && Number.isFinite(Date.parse(receipt.observedAt));
}

function signatureValid(receipt, trust) {
  try {
    return crypto.verify(null, Buffer.from(canonicalPayload(receipt)), trust.publicKeyPem,
      Buffer.from(receipt.signature || '', 'base64'));
  } catch (_) { return false; }
}

function verifyBundle(input) {
  if (typeof input.bundlePath !== 'string' || !path.isAbsolute(input.bundlePath)) {
    throw new Error('V2-03 requires an absolute signed-bundle path.');
  }
  const bundleDirectory = fs.realpathSync(path.dirname(input.bundlePath));
  const trustPath = fs.realpathSync(input.trustFilePath);
  if (trustPath.startsWith(`${bundleDirectory}${path.sep}`)) {
    throw new Error('V2-03 pinned trust must live outside the source bundle.');
  }
  const trust = loadTrust(input.trustFilePath);
  const bundle = JSON.parse(fs.readFileSync(input.bundlePath, 'utf8'));
  if (bundle.schemaVersion !== 1 || bundle.seed !== input.seed
    || !Array.isArray(bundle.receipts) || bundle.receipts.length !== input.expectedCount) {
    throw new Error('V2-03 signed bundle has the wrong seed or receipt count.');
  }
  const seen = new Set();
  const records = bundle.receipts.map((receipt) => {
    if (seen.has(receipt?.eventId)) throw new Error('V2-03 signed bundle contains a duplicate event.');
    seen.add(receipt?.eventId);
    return verifyOne({ receipt, trust, bundlePath: input.bundlePath,
      seed: input.seed, recipientId: input.recipientId });
  });
  return { records, verifierKeyFingerprint: trust.fingerprint, issuer: trust.issuer,
    bundleDigest: digest(fs.readFileSync(input.bundlePath)) };
}

module.exports = { canonicalPayload, keyFingerprint, verifyBundle };
