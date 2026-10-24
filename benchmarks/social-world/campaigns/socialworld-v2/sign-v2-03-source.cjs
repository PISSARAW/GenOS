'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { getDatabase, closeDatabase } = require('../../../../backend/src/db');
const { canonicalPayload, keyFingerprint, verifyBundle } = require('./v2-03-receipt-verifier.cjs');
const sourceWorld = require('./v2-03-source-world.cjs');

function loadSigner(input) {
  for (const field of ['sourceDirectory', 'privateKeyPath', 'trustFilePath']) {
    if (!path.isAbsolute(input[field] || '')) throw new Error(`V2-03 signer ${field} must be absolute.`);
  }
  const sourceRoot = fs.realpathSync(input.sourceDirectory);
  const keyPath = fs.realpathSync(input.privateKeyPath);
  if (keyPath.startsWith(`${sourceRoot}${path.sep}`)) {
    throw new Error('V2-03 signing key must live outside the source directory.');
  }
  const privateKey = crypto.createPrivateKey(fs.readFileSync(input.privateKeyPath));
  if (privateKey.asymmetricKeyType !== 'ed25519') throw new Error('V2-03 signing key must be Ed25519.');
  const trust = JSON.parse(fs.readFileSync(input.trustFilePath, 'utf8'));
  const fingerprint = keyFingerprint(crypto.createPublicKey(privateKey));
  if (fingerprint !== trust.fingerprint || fingerprint !== keyFingerprint(trust.publicKeyPem)) {
    throw new Error('V2-03 signing key does not match pinned trust.');
  }
  return { privateKey, trust };
}

function readSource(input) {
  const metadata = JSON.parse(fs.readFileSync(path.join(input.sourceDirectory, 'source-metadata.json'), 'utf8'));
  const root = fs.realpathSync(input.sourceDirectory);
  const databasePath = fs.realpathSync(metadata.databasePath);
  if (!databasePath.startsWith(`${root}${path.sep}`) || !Array.isArray(metadata.artifacts)
    || metadata.artifacts.length !== 5 || metadata.sourceKind !== 'persisted-organization-delivery') {
    throw new Error('V2-03 source metadata is invalid or outside its directory.');
  }
  return { metadata, databasePath, ids: sourceWorld.idsFor(metadata.seed) };
}

async function signSource(input) {
  const { privateKey, trust } = loadSigner(input);
  const source = readSource(input);
  const db = await getDatabase(source.databasePath);
  const receipts = [];
  try {
    for (const name of source.metadata.artifacts) {
      if (!/^event-[1-5]\.json$/.test(name)) throw new Error('V2-03 source artifact name is invalid.');
      const bytes = fs.readFileSync(path.join(input.sourceDirectory, name));
      const artifact = JSON.parse(bytes.toString('utf8'));
      if (artifact.seed !== source.metadata.seed || !await sourceWorld.verifyPersistedEvent({ db,
        ids: source.ids, artifact })) throw new Error(`V2-03 source event ${name} is not persisted and verified.`);
      const receipt = { issuer: trust.issuer, seed: artifact.seed, eventId: artifact.eventId,
        actorId: artifact.actorId, recipientId: artifact.recipientId, domain: artifact.domain,
        observedAt: new Date().toISOString(), sourceArtifact: name,
        sourceDigest: crypto.createHash('sha256').update(bytes).digest('hex') };
      receipts.push({ ...receipt,
        signature: crypto.sign(null, Buffer.from(canonicalPayload(receipt)), privateKey).toString('base64') });
    }
  } finally { await closeDatabase(); }
  const bundlePath = path.join(input.sourceDirectory, 'bundle.json');
  fs.writeFileSync(bundlePath, `${JSON.stringify({ schemaVersion: 1, seed: source.metadata.seed,
    receipts }, null, 2)}\n`, { flag: 'wx' });
  const verified = verifyBundle({ bundlePath, trustFilePath: input.trustFilePath,
    seed: source.metadata.seed, recipientId: source.ids.recipientId, expectedCount: 5 });
  return { bundlePath, receiptCount: verified.records.length,
    verifierKeyFingerprint: verified.verifierKeyFingerprint, bundleDigest: verified.bundleDigest };
}

if (require.main === module) {
  signSource(JSON.parse(process.argv[2] || '{}')).then((result) => {
    process.stdout.write(`${JSON.stringify(result)}\n`);
  }).catch((error) => { process.stderr.write(`${error.stack || error.message}\n`); process.exitCode = 1; });
}

module.exports = { signSource };
