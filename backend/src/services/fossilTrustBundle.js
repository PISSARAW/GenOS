const crypto = require('crypto');
const fs = require('fs');

const KEY_ID = /^[0-9a-f]{32}$/;
const PUBLIC_KEY = /^[0-9a-f]{64}$/;
const ED25519_SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');

function loadTrustedPublicKeys() {
  const filePath = process.env.GENOS_FOSSIL_TRUSTED_PUBLIC_KEYS_FILE;
  const encoded = filePath
    ? fs.readFileSync(filePath, 'utf8')
    : process.env.GENOS_FOSSIL_TRUSTED_PUBLIC_KEYS;
  if (!encoded) throw new Error('Backend fossil trust keys are not configured');
  return validateBundle(JSON.parse(encoded));
}

function validateBundle(value) {
  if (!value || Array.isArray(value) || typeof value !== 'object') {
    throw new Error('Fossil trust bundle must be a key-id map');
  }
  for (const [keyId, rawHex] of Object.entries(value)) {
    if (!KEY_ID.test(keyId) || typeof rawHex !== 'string' || !PUBLIC_KEY.test(rawHex)) {
      throw new Error('Fossil trust bundle contains an invalid key entry');
    }
    const publicKey = crypto.createPublicKey({
      key: Buffer.concat([ED25519_SPKI_PREFIX, Buffer.from(rawHex, 'hex')]),
      format: 'der', type: 'spki'
    });
    if (fingerprint(publicKey) !== keyId) {
      throw new Error('Configured fossil key id does not match its public key fingerprint');
    }
  }
  return value;
}

function fingerprint(publicKey) {
  return crypto.createHash('sha256')
    .update(publicKey.export({ format: 'der', type: 'spki' }))
    .digest('hex').slice(0, 32);
}

module.exports = { loadTrustedPublicKeys, validateBundle };
