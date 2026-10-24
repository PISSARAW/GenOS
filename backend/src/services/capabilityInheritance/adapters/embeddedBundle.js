'use strict';

const { createHash, sign, verify } = require('node:crypto');
const Ajv = require('ajv');
const { createCapabilityDescriptor } = require('../catalog/capabilityDescriptor');
const { adapterError } = require('./adapterContract');
const PACKAGE_SCHEMA = require('../../../../../spec/gci/embedded-package.schema.json');
const CAPABILITY_SCHEMA = require('../../../../../spec/gci/capability.schema.json');

const MAX_ARTIFACT_BYTES = 16 * 1024 * 1024;
const MAX_BUNDLE_BYTES = 24 * 1024 * 1024;
const packageValidator = new Ajv({ allErrors: true, strict: false });
packageValidator.addSchema(CAPABILITY_SCHEMA);
const validatePackage = packageValidator.compile(PACKAGE_SCHEMA);

function createEmbeddedBundle(input) {
  const descriptor = createCapabilityDescriptor(input.descriptor);
  if (!descriptor.exportModes.includes('embedded')) throw adapterError('GCI_MODE_NOT_EXPORTED');
  const artifact = binaryArtifact(input.artifact);
  assertArtifactDigest(artifact, descriptor.implementationDigest);
  const keyId = required(input.keyId, 'GCI_SIGNING_KEY_ID_REQUIRED');
  const payload = signedPayload(descriptor);
  const signature = sign(null, payload, input.privateKey).toString('base64');
  return Buffer.from(JSON.stringify({ schema: 'genos.gci.embedded-package/v1', descriptor,
    artifactBase64: artifact.toString('base64'), attestation: { algorithm: 'Ed25519', keyId, signature } }));
}

function verifyEmbeddedBundle(source, trustedKeys) {
  const bundleBytes = binaryArtifact(source, MAX_BUNDLE_BYTES);
  let bundle;
  try { bundle = JSON.parse(bundleBytes.toString('utf8')); }
  catch { throw adapterError('GCI_PACKAGE_INVALID'); }
  if (!validatePackage(bundle)) throw adapterError('GCI_PACKAGE_INVALID');
  const descriptor = createCapabilityDescriptor(bundle.descriptor);
  if (!descriptor.exportModes.includes('embedded')) throw adapterError('GCI_MODE_NOT_EXPORTED');
  const artifact = decodeArtifact(bundle.artifactBase64);
  assertArtifactDigest(artifact, descriptor.implementationDigest);
  verifyAttestation(bundle.attestation, signedPayload(descriptor), trustedKeys);
  return Object.freeze({ descriptor, artifact, attestation: Object.freeze({ ...bundle.attestation }) });
}

function verifyAttestation(attestation, payload, trustedKeys) {
  if (attestation.algorithm !== 'Ed25519' || typeof attestation.signature !== 'string') throw adapterError('GCI_PROVENANCE_INVALID');
  const publicKey = trustedKeys?.[attestation.keyId];
  if (!publicKey || !verify(null, payload, publicKey, Buffer.from(attestation.signature, 'base64'))) {
    throw adapterError('GCI_PROVENANCE_INVALID');
  }
}

function signedPayload(descriptor) {
  return Buffer.from(JSON.stringify({ schema: 'genos.gci.embedded-attestation/v1', descriptor }));
}

function decodeArtifact(value) {
  if (typeof value !== 'string' || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) {
    throw adapterError('GCI_PACKAGE_INVALID');
  }
  return binaryArtifact(Buffer.from(value, 'base64'));
}

function binaryArtifact(value, maxBytes = MAX_ARTIFACT_BYTES) {
  if (!Buffer.isBuffer(value) && !(value instanceof Uint8Array)) throw adapterError('GCI_ARTIFACT_UNAVAILABLE');
  const result = Buffer.from(value);
  if (!result.length || result.length > maxBytes) throw adapterError('GCI_ARTIFACT_SIZE_INVALID');
  return result;
}

function assertArtifactDigest(artifact, expectedDigest) {
  const actual = `sha256:${createHash('sha256').update(artifact).digest('hex')}`;
  if (actual !== expectedDigest) throw adapterError('GCI_ARTIFACT_CHANGED');
}

function required(value, code) {
  if (typeof value !== 'string' || !value.trim()) throw adapterError(code);
  return value.trim();
}

module.exports = { createEmbeddedBundle, verifyEmbeddedBundle };
