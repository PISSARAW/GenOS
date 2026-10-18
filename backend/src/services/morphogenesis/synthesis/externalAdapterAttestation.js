'use strict';

const crypto = require('node:crypto');
const { canonicalJson } = require('../../aTeam/variants/variantExecutionHelpers');

const ADAPTER_SCHEMA = 'genos.morphogenesis.p3-adapter-attestation/v1';
const RECEIPT_SCHEMA = 'genos.morphogenesis.p3-adapter-receipt/v1';
const SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');

function fail(message) {
  throw Object.assign(new Error(message), { code: 'P3_EXTERNAL_ATTESTATION_INVALID' });
}

function unsigned(value) {
  const body = { ...value };
  delete body.signature;
  return body;
}

function signingBytes(domain, value) {
  return Buffer.from(`${domain}\n${canonicalJson(unsigned(value))}`, 'utf8');
}

function adapterSigningBytes(attestation) {
  return signingBytes('genos-morphogenesis-p3-adapter-attestation-v1', attestation);
}

function receiptSigningBytes(receipt) {
  return signingBytes('genos-morphogenesis-p3-adapter-receipt-v1', receipt);
}

function trustBundle() {
  let parsed;
  try { parsed = JSON.parse(process.env.GENOS_P3_ADAPTER_TRUST_JSON || ''); }
  catch (_) { fail('External adapter trust bundle is invalid.'); }
  if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') {
    fail('External adapter trust bundle is required.');
  }
  return parsed;
}

function publicKey(value) {
  try {
    if (/^[a-f0-9]{64}$/i.test(value)) {
      return crypto.createPublicKey({ key: Buffer.concat([SPKI_PREFIX, Buffer.from(value, 'hex')]),
        format: 'der', type: 'spki' });
    }
    return crypto.createPublicKey(value);
  } catch (_) { fail('External adapter public key is invalid.'); }
}

function trustedKey(keyId) {
  if (!/^[a-f0-9]{32}$/.test(String(keyId || ''))) fail('External adapter key ID is invalid.');
  const encoded = trustBundle()[keyId];
  if (typeof encoded !== 'string') fail('External adapter signer is not trusted.');
  const key = publicKey(encoded);
  if (key.asymmetricKeyType !== 'ed25519') fail('External adapter signer must use Ed25519.');
  const raw = key.export({ type: 'spki', format: 'der' }).subarray(-32);
  const actualId = crypto.createHash('sha256').update(raw).digest('hex').slice(0, 32);
  if (actualId !== keyId) fail('External adapter key ID does not match its public key.');
  return key;
}

function validSignature(value, bytes, key) {
  return /^[a-f0-9]{128}$/.test(String(value || ''))
    && crypto.verify(null, bytes, key, Buffer.from(value, 'hex'));
}

function verifyAdapter(config) {
  const proof = config.attestation;
  const expected = { schema: ADAPTER_SCHEMA, keyId: proof?.keyId, framework: config.framework,
    adapterVersion: config.adapterVersion, commandSha256: config.commandSha256,
    artifactSha256: config.artifactSha256 };
  if (canonicalJson(unsigned(proof || {})) !== canonicalJson(expected)) {
    fail('External adapter attestation is not bound to its executable identity.');
  }
  const key = trustedKey(proof.keyId);
  if (!validSignature(proof.signature, adapterSigningBytes(proof), key)) {
    fail('External adapter attestation signature is invalid.');
  }
  return proof.keyId;
}

function verifyReceipt(config, receipt) {
  const keyId = verifyAdapter(config);
  if (receipt?.schema !== RECEIPT_SCHEMA || receipt.signerKeyId !== keyId) {
    fail('External adapter receipt signer is not bound to its attestation.');
  }
  const key = trustedKey(keyId);
  if (!validSignature(receipt.signature, receiptSigningBytes(receipt), key)) {
    fail('External adapter receipt signature is invalid.');
  }
  return true;
}

module.exports = { ADAPTER_SCHEMA, adapterSigningBytes, receiptSigningBytes,
  verifyAdapter, verifyReceipt };
