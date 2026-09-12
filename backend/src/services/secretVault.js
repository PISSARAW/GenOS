const crypto = require('crypto');

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

module.exports = { encrypt, decrypt };
