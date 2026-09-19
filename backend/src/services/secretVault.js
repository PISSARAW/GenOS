const crypto = require('crypto');
const fs = require('fs');

const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1 };
const KEY_LENGTH = 32;
const FORMAT_VERSION = 'v2';

function masterSecret() {
  const raw = process.env.GENOS_SECRET_KEY;
  if (!raw) throw new Error('GENOS_SECRET_KEY must be configured.');
  return raw;
}

// Legacy keys were an unsalted SHA-256 of the master secret. Kept only to read
// pre-existing ciphertexts; new writes always use the salted scrypt KDF below.
function legacyKey() {
  return crypto.createHash('sha256').update(masterSecret()).digest();
}

function deriveKey(salt) {
  return crypto.scryptSync(masterSecret(), salt, KEY_LENGTH, SCRYPT_PARAMS);
}

function encrypt(value) {
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', deriveKey(salt), iv);
  const ciphertext = Buffer.concat([cipher.update(String(value), 'utf8'), cipher.final()]);
  return {
    ciphertext: `${FORMAT_VERSION}$${salt.toString('base64')}$${ciphertext.toString('base64')}`,
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64')
  };
}

function resolveRecordKey(record) {
  const parts = String(record.ciphertext || '').split('$');
  if (parts.length === 3 && parts[0] === FORMAT_VERSION) {
    return { key: deriveKey(Buffer.from(parts[1], 'base64')), ciphertext: Buffer.from(parts[2], 'base64') };
  }
  return { key: legacyKey(), ciphertext: Buffer.from(String(record.ciphertext || ''), 'base64') };
}

function decrypt(record) {
  const resolved = resolveRecordKey(record);
  const decipher = crypto.createDecipheriv('aes-256-gcm', resolved.key, Buffer.from(record.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(record.tag, 'base64'));
  return Buffer.concat([decipher.update(resolved.ciphertext), decipher.final()]).toString('utf8');
}

function getProvider() {
  const provider = String(process.env.GENOS_SECRETS_PROVIDER || 'local').trim().toLowerCase();
  if (!['local', 'hashicorp-vault'].includes(provider)) throw new Error(`Unsupported secret provider '${provider}'.`);
  return provider;
}

function vaultToken() {
  if (process.env.GENOS_VAULT_TOKEN) return process.env.GENOS_VAULT_TOKEN;
  const tokenPath = process.env.GENOS_VAULT_TOKEN_FILE;
  if (!tokenPath) throw new Error('GENOS_VAULT_TOKEN or GENOS_VAULT_TOKEN_FILE is required for Vault.');
  const stat = fs.statSync(tokenPath);
  if (!stat.isFile() || (process.platform !== 'win32' && (stat.mode & 0o077) !== 0)) {
    throw new Error('Vault token file must be a private regular file.');
  }
  return fs.readFileSync(tokenPath, 'utf8').trim();
}

function vaultEndpoint(reference) {
  const address = String(process.env.GENOS_VAULT_ADDR || '').replace(/\/$/, '');
  if (!address) throw new Error('GENOS_VAULT_ADDR must be configured.');
  const url = new URL(address);
  if (url.protocol !== 'https:' && !['localhost', '127.0.0.1', '::1'].includes(url.hostname)) {
    throw new Error('Vault must use HTTPS except for loopback development.');
  }
  const mount = String(process.env.GENOS_VAULT_KV_MOUNT || 'secret').replace(/^\/+|\/+$/g, '');
  const path = reference.split('/').map(encodeURIComponent).join('/');
  return `${address}/v1/${mount}/data/${path}`;
}

async function vaultRequest(reference, method, value) {
  const headers = { 'X-Vault-Token': vaultToken(), 'Content-Type': 'application/json' };
  if (process.env.GENOS_VAULT_NAMESPACE) headers['X-Vault-Namespace'] = process.env.GENOS_VAULT_NAMESPACE;
  const response = await fetch(vaultEndpoint(reference), {
    method, headers, signal: AbortSignal.timeout(5000),
    body: method === 'PUT' ? JSON.stringify({ data: { value } }) : undefined
  });
  if (response.status === 404 && method === 'GET') return null;
  if (!response.ok) throw new Error(`Vault request failed with HTTP ${response.status}.`);
  if (method !== 'GET') return true;
  const payload = await response.json();
  const secret = payload?.data?.data?.value;
  return typeof secret === 'string' ? secret : null;
}

function writeExternalSecret(reference, value) {
  return vaultRequest(reference, 'PUT', value);
}

function readExternalSecret(reference) {
  return vaultRequest(reference, 'GET');
}

async function resolveStoredSecret(db, input) {
  const row = await db.get(
    'SELECT * FROM secrets WHERE name = ? AND organization_id IS ? AND project_id IS ?',
    input.name, input.organizationId || null, input.projectId || null
  );
  if (!row) return null;
  if (row.provider === 'hashicorp-vault') return readExternalSecret(row.external_ref);
  return decrypt(row);
}

module.exports = { encrypt, decrypt, getProvider, writeExternalSecret, readExternalSecret, resolveStoredSecret };
