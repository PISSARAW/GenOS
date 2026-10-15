'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');

const TTL_MS = 30_000;

async function createSensoryAuthorityFile(input) {
  const privateKey = loadSigningKey(process.env.GENOS_CLI_AUTHORITY_PRIVATE_KEY_PEM);
  const publicBytes = crypto.createPublicKey(privateKey).export({ type: 'spki', format: 'der' }).subarray(-32);
  const publicKeyHex = publicBytes.toString('hex');
  const keyId = crypto.createHash('sha256').update(publicBytes).digest('hex').slice(0, 32);
  const trust = parseBackendTrust(process.env.GENOS_CLI_AUTHORITY_TRUST_JSON);
  if (trust[keyId]?.toLowerCase() !== publicKeyHex) throw authorityError('Backend sensory signer is not pinned by Rust authority trust.');
  const now = Date.now();
  const claims = {
    schema: 'genos.authenticated-sensory-backend-authority/v1', key_id: keyId,
    organization_id: input.tenant.organizationId, project_id: input.tenant.projectId,
    principal_id: input.principalId, mission_id: input.receipt.missionId,
    producer_id: input.receipt.producerId, tick: input.receipt.tick,
    stimulus_sha256: input.receipt.stimulusSha256,
    producer_signature_hex: input.receipt.signatureHex,
    producer_trust_key_sha256: input.receipt.trustKeySha256,
    signal_json: input.receipt.signalJson, payload_hash: input.receipt.payloadHash,
    issued_at_unix_ms: now, expires_at_unix_ms: now + TTL_MS, nonce: crypto.randomUUID(),
  };
  const signature = crypto.sign(null, signingBytes(claims), privateKey).toString('hex');
  return writeAuthorityFile(input.root, input.tenant, { claims, signature });
}

function signingBytes(claims) {
  const text = ['schema', 'key_id', 'organization_id', 'project_id', 'principal_id', 'mission_id', 'producer_id'];
  const values = text.map(key => Buffer.from(claims[key], 'utf8').toString('hex'));
  values.push(String(claims.tick));
  for (const key of ['stimulus_sha256', 'producer_signature_hex', 'producer_trust_key_sha256', 'signal_json', 'payload_hash']) {
    values.push(Buffer.from(claims[key], 'utf8').toString('hex'));
  }
  values.push(String(claims.issued_at_unix_ms), String(claims.expires_at_unix_ms), Buffer.from(claims.nonce, 'utf8').toString('hex'));
  return Buffer.from(`genos-sensory-backend-authority-v1\n${values.join('\n')}`);
}

function loadSigningKey(value) {
  if (typeof value !== 'string' || !value.includes('PRIVATE KEY')) throw authorityError('Backend sensory signing key is unavailable.');
  try { return crypto.createPrivateKey(value); }
  catch { throw authorityError('Backend sensory signing key is invalid.'); }
}

function parseBackendTrust(value) {
  try {
    const trust = JSON.parse(value || '');
    if (!trust || Array.isArray(trust) || typeof trust !== 'object') throw new Error('invalid trust');
    return trust;
  } catch { throw authorityError('GENOS_CLI_AUTHORITY_TRUST_JSON must pin the backend sensory signer.'); }
}

async function writeAuthorityFile(root, tenant, envelope) {
  await fs.mkdir(root, { recursive: true });
  const canonicalRoot = await fs.realpath(root);
  const directory = path.join(canonicalRoot, 'tenants', tenant.organizationId, tenant.projectId, 'sensory-authority');
  await fs.mkdir(directory, { recursive: true, mode: 0o700 });
  const canonicalDirectory = await fs.realpath(directory);
  if (!canonicalDirectory.startsWith(`${canonicalRoot}${path.sep}`)) throw authorityError('Sensory authority path escaped the bridge root.');
  const file = path.join(canonicalDirectory, `${crypto.randomUUID()}.json`);
  await fs.writeFile(file, JSON.stringify(envelope), { flag: 'wx', mode: 0o600 });
  return { path: file, reference: path.relative(canonicalRoot, file) };
}

function authorityError(message) { return Object.assign(new Error(message), { code: 'SENSORY_BACKEND_AUTHORITY_UNAVAILABLE' }); }

module.exports = { createSensoryAuthorityFile };
