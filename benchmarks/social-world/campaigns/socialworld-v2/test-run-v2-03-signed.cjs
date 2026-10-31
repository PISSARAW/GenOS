'use strict';

process.env.GENOS_ADMIN_PASSWORD ||= 'social-v203-signed-test-only';
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { runScenario } = require('./run-v2-03.cjs');
const { canonicalPayload, keyFingerprint, verifyBundle } = require('./v2-03-receipt-verifier.cjs');
const { validateReport } = require('./validate-report.cjs');

const SEED = 'socialworld-v2-03-signed-test';
const RECIPIENT = `v203-${SEED}-agent`;

function writeJson(filename, value) {
  fs.writeFileSync(filename, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' });
}

function makeReceipt(input) {
  const eventId = `external-event-${input.index}`;
  const sourceArtifact = `event-${input.index}.json`;
  const artifact = { schemaVersion: 1, seed: SEED, eventId, actorId: 'independent-world-actor',
    recipientId: RECIPIENT, domain: 'social_help', status: 'delivered',
    deliveryReceipt: { signalId: `test-signal-${input.index}`, status: 'delivered',
      integrityStatus: 'verified', recipientAgentId: RECIPIENT, sourceRef: `event:${eventId}` } };
  const artifactPath = path.join(input.directory, sourceArtifact);
  writeJson(artifactPath, artifact);
  const receipt = { issuer: 'external-test-verifier', seed: SEED, eventId,
    actorId: artifact.actorId, recipientId: RECIPIENT, domain: artifact.domain,
    observedAt: '2026-10-24T10:00:00.000Z', sourceArtifact,
    sourceDigest: crypto.createHash('sha256').update(fs.readFileSync(artifactPath)).digest('hex') };
  return { ...receipt, signature: crypto.sign(null, Buffer.from(canonicalPayload(receipt)), input.privateKey).toString('base64') };
}

async function run() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'genos-v203-signed-'));
  try {
    const keys = crypto.generateKeyPairSync('ed25519');
    const publicKeyPem = keys.publicKey.export({ type: 'spki', format: 'pem' });
    const trustFilePath = path.join(directory, 'trust.json');
    const sourceDirectory = path.join(directory, 'source');
    fs.mkdirSync(sourceDirectory);
    const receiptBundlePath = path.join(sourceDirectory, 'bundle.json');
    writeJson(trustFilePath, { issuer: 'external-test-verifier', publicKeyPem,
      fingerprint: keyFingerprint(publicKeyPem) });
    const receipts = Array.from({ length: 5 }, (_, index) => makeReceipt({ index: index + 1,
      directory: sourceDirectory, privateKey: keys.privateKey }));
    writeJson(receiptBundlePath, { schemaVersion: 1, seed: SEED, receipts });
    const outputDirectory = path.join(directory, 'run');
    const result = await runScenario({ scenario: 'V2-03', arm: 'genos-full', seed: SEED, attempt: 1,
      outputDirectory, sourceCommit: '0123456789abcdef', receiptBundlePath, trustFilePath });
    assert.equal(result.report.status, 'pass');
    assert.equal(result.evidence.positive.authenticatedReceiptsBound, true);
    assert.equal(result.evidence.positive.relationPersisted, true);
    assert.equal(result.evidence.negative.episodeCount, 0);
    assert.equal(result.evidence.negative.relationCount, 0);
    assert.equal(result.evidence.positive.sourceEvidence.length, 5);
    assert.deepEqual(validateReport(result.report, path.join(outputDirectory, 'run.json')), []);
    const firstArtifact = path.join(sourceDirectory, 'event-1.json');
    fs.appendFileSync(firstArtifact, 'tampered');
    assert.throws(() => verifyBundle({ bundlePath: receiptBundlePath, trustFilePath,
      seed: SEED, recipientId: RECIPIENT, expectedCount: 5 }), /digest mismatch/);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

run().then(() => process.stdout.write('V2-03 signed receipt restart test passed\n'))
  .catch((error) => { process.stderr.write(`${error.stack || error.message}\n`); process.exitCode = 1; });
