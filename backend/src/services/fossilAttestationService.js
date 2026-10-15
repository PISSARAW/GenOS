const crypto = require('crypto');
const provenance = require('./fossilProvenanceService');
const trustBundle = require('./fossilTrustBundle');

function material(record, signerId) {
  return {
    version: 1,
    algorithm: 'ed25519',
    key_id: signerId,
    fossil_id: record.fossil_id,
    source_event_id: record.source_event_id,
    source_event_hash: record.source_event_hash,
    extinct_lineage_id: record.extinct_lineage_id,
    organization_id: record.organization_id || null,
    project_id: record.project_id || null,
    payload_hash: record.payload_hash
  };
}

function privateKey() {
  const encoded = process.env.GENOS_FOSSIL_SIGNING_PRIVATE_KEY;
  if (!encoded) throw new Error('Backend fossil signing key is required for provenance-bound fossilization');
  return crypto.createPrivateKey(encoded.replace(/\\n/g, '\n'));
}

function keyId(publicKey) {
  const bytes = publicKey.export({ format: 'der', type: 'spki' });
  return crypto.createHash('sha256').update(bytes).digest('hex').slice(0, 32);
}

function create(record) {
  const signer = privateKey();
  const publicKey = crypto.createPublicKey(signer);
  const signerId = keyId(publicKey);
  return {
    version: 1,
    algorithm: 'ed25519',
    key_id: signerId,
    signature: crypto.sign(null, Buffer.from(provenance.stableStringify(material(record, signerId))), signer).toString('hex')
  };
}

function trustedPublicKey(keyIdValue) {
  const keys = trustBundle.loadTrustedPublicKeys();
  const rawHex = keys[keyIdValue];
  if (typeof rawHex !== 'string' || !/^[0-9a-f]{64}$/i.test(rawHex)) {
    throw new Error(`Unknown backend fossil signer: ${keyIdValue}`);
  }
  const prefix = Buffer.from('302a300506032b6570032100', 'hex');
  const der = Buffer.concat([prefix, Buffer.from(rawHex, 'hex')]);
  const publicKey = crypto.createPublicKey({ key: der, format: 'der', type: 'spki' });
  if (keyId(publicKey) !== keyIdValue) throw new Error('Configured fossil key id does not match its public key fingerprint');
  return publicKey;
}

function verify(record) {
  const proof = record?.attestation;
  if (!proof || proof.version !== 1 || proof.algorithm !== 'ed25519') return false;
  try {
    const publicKey = trustedPublicKey(proof.key_id);
    return crypto.verify(
      null,
      Buffer.from(provenance.stableStringify(material(record, proof.key_id))),
      publicKey,
      Buffer.from(proof.signature, 'hex')
    );
  } catch (_) {
    return false;
  }
}

module.exports = { create, verify };
