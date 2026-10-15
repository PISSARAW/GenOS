'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');

const CLAIM_TTL_MS = 30_000;

async function createAuthorityFile(input) {
  const { root, tenant, claims } = input;
  const privateKey = loadPrivateKey(process.env.GENOS_CLI_AUTHORITY_PRIVATE_KEY_PEM);
  const publicKeyHex = publicKeyBytes(privateKey).toString('hex');
  const keyId = crypto.createHash('sha256').update(Buffer.from(publicKeyHex, 'hex')).digest('hex').slice(0, 32);
  const trust = parseTrust(process.env.GENOS_CLI_AUTHORITY_TRUST_JSON);
  if (trust[keyId] !== publicKeyHex) throw authorityError('CLI authority signing key is not pinned in the backend trust configuration.');
  const issuedAt = Date.now();
  const signedClaims = orderedClaims({ ...claims, schema: 'genos.cli-authority/v1', key_id: keyId,
    organization_id: tenant.organizationId, project_id: tenant.projectId,
    issued_at_unix_ms: issuedAt, expires_at_unix_ms: issuedAt + CLAIM_TTL_MS,
    nonce: crypto.randomUUID() });
  const signature = crypto.sign(null, signingBytes(signedClaims), privateKey).toString('hex');
  return writeAuthorityFile({ root, tenant, envelope: { claims: signedClaims, signature } });
}

function orderedClaims(input) {
  return {
    schema: input.schema, key_id: input.key_id, organization_id: input.organization_id,
    project_id: input.project_id, mission_id: input.mission_id, rust_mission_id: input.rust_mission_id,
    cell_id: input.cell_id, operation: input.operation, detail: input.detail,
    value: input.value, tick: input.tick,
    idempotency_key: input.idempotency_key, issued_at_unix_ms: input.issued_at_unix_ms,
    expires_at_unix_ms: input.expires_at_unix_ms, nonce: input.nonce
  };
}

function signingBytes(claims) {
  const strings = ['schema', 'key_id', 'organization_id', 'project_id', 'mission_id',
    'rust_mission_id', 'cell_id', 'operation', 'detail', 'value', 'idempotency_key'];
  const values = strings.map(key => Buffer.from(claims[key], 'utf8').toString('hex'));
  values.push(String(claims.tick), String(claims.issued_at_unix_ms), String(claims.expires_at_unix_ms));
  values.push(Buffer.from(claims.nonce, 'utf8').toString('hex'));
  return Buffer.from(`genos-cli-authority-v1\n${values.join('\n')}`, 'utf8');
}

function loadPrivateKey(value) {
  if (typeof value !== 'string' || !value.includes('PRIVATE KEY')) {
    throw authorityError('GENOS_CLI_AUTHORITY_PRIVATE_KEY_PEM is required.');
  }
  try { return crypto.createPrivateKey(value); }
  catch { throw authorityError('CLI authority private key is invalid.'); }
}

function publicKeyBytes(privateKey) {
  const der = crypto.createPublicKey(privateKey).export({ type: 'spki', format: 'der' });
  if (der.length < 32) throw authorityError('CLI authority public key is invalid.');
  return der.subarray(der.length - 32);
}

function parseTrust(value) {
  try {
    const trust = JSON.parse(value || '');
    if (!trust || Array.isArray(trust) || typeof trust !== 'object') throw new Error('invalid trust map');
    return trust;
  } catch { throw authorityError('GENOS_CLI_AUTHORITY_TRUST_JSON must pin the backend signing public key.'); }
}

async function writeAuthorityFile(input) {
  await fs.mkdir(input.root, { recursive: true, mode: 0o700 });
  const root = await fs.realpath(input.root);
  const tenantRoot = path.join(root, 'tenants', pathPart(input.tenant.organizationId), pathPart(input.tenant.projectId));
  const directory = path.join(tenantRoot, 'cli-authority');
  await fs.mkdir(directory, { recursive: true, mode: 0o700 });
  const resolved = await fs.realpath(directory);
  if (!resolved.startsWith(`${root}${path.sep}`)) throw authorityError('CLI authority path escaped the bridge root.');
  const file = path.join(resolved, `${crypto.randomUUID()}.json`);
  await fs.writeFile(file, JSON.stringify(input.envelope), { flag: 'wx', mode: 0o600 });
  return { path: file, reference: path.relative(root, file) };
}

function pathPart(value) {
  return String(value).replace(/[^a-zA-Z0-9._-]/g, '_');
}

function authorityError(message) {
  const error = new Error(message);
  error.code = 'CLI_AUTHORITY_CONFIGURATION_INVALID';
  return error;
}

module.exports = { CLAIM_TTL_MS, createAuthorityFile };
