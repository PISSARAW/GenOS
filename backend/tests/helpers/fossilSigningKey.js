const crypto = require('crypto');

function configureTestFossilSigner() {
  const privateKey = process.env.GENOS_FOSSIL_SIGNING_PRIVATE_KEY
    ? crypto.createPrivateKey(process.env.GENOS_FOSSIL_SIGNING_PRIVATE_KEY)
    : crypto.generateKeyPairSync('ed25519').privateKey;
  process.env.GENOS_FOSSIL_SIGNING_PRIVATE_KEY = privateKey.export({ format: 'pem', type: 'pkcs8' });
  const publicDer = crypto.createPublicKey(privateKey).export({ format: 'der', type: 'spki' });
  const keyId = crypto.createHash('sha256').update(publicDer).digest('hex').slice(0, 32);
  process.env.GENOS_FOSSIL_TRUSTED_PUBLIC_KEYS = JSON.stringify({ [keyId]: publicDer.subarray(-32).toString('hex') });
}

module.exports = { configureTestFossilSigner };
