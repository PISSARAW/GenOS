'use strict';

process.env.GENOS_ADMIN_PASSWORD ||= 'social-v203-source-test-only';
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { runScenario } = require('./run-v2-03.cjs');
const { keyFingerprint } = require('./v2-03-receipt-verifier.cjs');

function runProcess(script, input) {
  const result = spawnSync(process.execPath, [path.join(__dirname, script), JSON.stringify(input)],
    { encoding: 'utf8', timeout: 120000, env: { ...process.env } });
  if (result.status !== 0) throw new Error(`${script}: ${result.error?.message || result.stderr}`);
  return JSON.parse(result.stdout.trim().split(/\r?\n/).at(-1));
}

async function run() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'genos-v203-runtime-source-'));
  try {
    const keys = crypto.generateKeyPairSync('ed25519');
    const privateKeyPath = path.join(root, 'signer-private.pem');
    const trustFilePath = path.join(root, 'trust.json');
    fs.writeFileSync(privateKeyPath, keys.privateKey.export({ type: 'pkcs8', format: 'pem' }), { flag: 'wx', mode: 0o600 });
    fs.writeFileSync(trustFilePath, `${JSON.stringify({ issuer: 'v203-independent-test-verifier',
      publicKeyPem: keys.publicKey.export({ type: 'spki', format: 'pem' }),
      fingerprint: keyFingerprint(keys.publicKey) }, null, 2)}\n`, { flag: 'wx' });
    const seed = 'socialworld-v2-runtime-test';
    const sourceDirectory = path.join(root, 'source');
    const produced = runProcess('produce-v2-03-source.cjs', { seed, outputDirectory: sourceDirectory });
    assert.equal(produced.artifacts.length, 5);
    const signed = runProcess('sign-v2-03-source.cjs', { sourceDirectory, privateKeyPath, trustFilePath });
    assert.equal(signed.receiptCount, 5);
    const result = await runScenario({ scenario: 'V2-03', arm: 'genos-full', seed, attempt: 1,
      outputDirectory: path.join(root, 'memory-run'), sourceCommit: '0123456789abcdef',
      receiptBundlePath: signed.bundlePath, trustFilePath });
    assert.equal(result.report.status, 'pass');
    assert.equal(result.evidence.positive.authenticatedReceiptsBound, true);
    assert.equal(result.evidence.positive.relationPersisted, true);
    assert.equal(result.evidence.negative.episodeCount, 0);
    assert.equal(result.evidence.negative.relationCount, 0);
    assert.equal(result.report.evidenceRefs.length, 8);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
}

run().then(() => process.stdout.write('V2-03 persisted source, independent signer and restart passed\n'))
  .catch((error) => { process.stderr.write(`${error.stack || error.message}\n`); process.exitCode = 1; });
