'use strict';

const { generateKeyPairSync, sign, randomUUID } = require('node:crypto');
const { authorizationPayload } = require('../src/services/shev/authorityService');

function authority() {
  const key = generateKeyPairSync('ed25519');
  return {
    publicKey: key.publicKey.export({ type: 'spki', format: 'pem' }),
    authorize: input => {
      const nonce = `shev-test-${randomUUID()}`;
      const expiresAt = new Date(Date.now() + 3600000).toISOString();
      const payload = authorizationPayload({ ...input, nonce, expiresAt });
      return { nonce, expiresAt, signature: sign(null, Buffer.from(JSON.stringify(payload)), key.privateKey).toString('base64') };
    }
  };
}

module.exports = { authority };
