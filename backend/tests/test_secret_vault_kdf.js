const assert = require('node:assert/strict');
const crypto = require('node:crypto');

process.env.GENOS_SECRET_KEY = 'test-master-key-for-vault';
const vault = require('../src/services/secretVault');

const encrypted = vault.encrypt('s3cret-value');
assert.ok(encrypted.ciphertext.startsWith('v2$'), 'new records use the salted KDF format');
assert.equal(vault.decrypt(encrypted), 's3cret-value');

// A leaked record must not be decryptable with an unsalted SHA-256 key.
const legacyKey = crypto.createHash('sha256').update(process.env.GENOS_SECRET_KEY).digest();
const iv = crypto.randomBytes(12);
const cipher = crypto.createCipheriv('aes-256-gcm', legacyKey, iv);
const legacyCiphertext = Buffer.concat([cipher.update('legacy-value', 'utf8'), cipher.final()]);
const legacyRecord = {
  ciphertext: legacyCiphertext.toString('base64'),
  iv: iv.toString('base64'),
  tag: cipher.getAuthTag().toString('base64')
};
assert.equal(vault.decrypt(legacyRecord), 'legacy-value', 'legacy ciphertexts remain readable');

console.log('Secret vault KDF checks passed.');
