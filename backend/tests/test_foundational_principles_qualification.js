'use strict';

process.env.GENOS_DISABLE_DOTENV = '1';
process.env.GENOS_DB_BACKUP_SKIP = '1';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const qualification = require('../src/services/foundationalPrincipleQualification');
const lifecycle = require('../src/services/foundationalQualificationLifecycle');

function digestOutput(result) {
  return crypto.createHash('sha256').update(result.stdout || '').update('\0')
    .update(result.stderr || '').digest('hex');
}

function runEvidence(repositoryRoot, manifest, test) {
  const result = spawnSync(process.execPath, [path.join(repositoryRoot, test)], {
    cwd: repositoryRoot, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024,
    env: { ...process.env, GENOS_ADMIN_PASSWORD: process.env.GENOS_ADMIN_PASSWORD
      || 'foundational-qualification-test-only' }
  });
  assert.equal(result.status, 0, `${test} failed\n${result.stdout || ''}\n${result.stderr || ''}`);
  return { exitCode: result.status, revision: manifest.qualificationRevision,
    observedAt: new Date().toISOString(), outputDigest: digestOutput(result) };
}

function assertBaseline(repositoryRoot, revision) {
  const result = spawnSync('git', ['merge-base', '--is-ancestor', revision, 'HEAD'], {
    cwd: repositoryRoot, encoding: 'utf8' });
  assert.equal(result.status, 0, 'The qualified baseline must be an ancestor of HEAD.');
}

function collectEvidence(repositoryRoot, manifest) {
  return Object.fromEntries(manifest.evidenceSuite.map((test) =>
    [test, runEvidence(repositoryRoot, manifest, test)]));
}

function assertFailClosed(spec) {
  const missing = { ...spec.observations };
  delete missing[spec.manifest.evidenceSuite[0]];
  assert.throws(() => qualification.qualify({ ...spec, observations: missing }),
    { code: 'FOUNDATION_EXECUTABLE_EVIDENCE_REQUIRED' });
  const failed = { ...spec.observations, [spec.manifest.evidenceSuite[0]]:
    { ...spec.observations[spec.manifest.evidenceSuite[0]], exitCode: 1 } };
  assert.throws(() => qualification.qualify({ ...spec, observations: failed }),
    { code: 'FOUNDATION_EXECUTABLE_EVIDENCE_REQUIRED' });
}

function main() {
  const repositoryRoot = path.resolve(__dirname, '..', '..');
  const manifestPath = path.join(repositoryRoot, 'shared',
    'foundationalPrinciplesQualification.json');
  const manifest = qualification.readManifest(manifestPath);
  assertBaseline(repositoryRoot, manifest.baselineRevision);
  assertBaseline(repositoryRoot, manifest.qualificationRevision);
  const observations = collectEvidence(repositoryRoot, manifest);
  const spec = { repositoryRoot, manifest, observations };
  const receipt = qualification.qualify(spec);
  assert.equal(receipt.score, 4);
  assert.equal(receipt.qualifiedCount, 19);
  assert.equal(receipt.totalCount, 19);
  assert.equal(receipt.authorizesPromotion, false);
  assert.equal(receipt.universalClaim, false);
  assert.match(receipt.receiptHash, /^[a-f0-9]{64}$/);
  const persistedReceipt = JSON.parse(fs.readFileSync(path.join(repositoryRoot, 'docs',
    '06-qualite-preuves', 'receipts', 'principes-fondateurs-phase9.json'), 'utf8'));
  assert.deepEqual(receipt, persistedReceipt, 'The versioned qualification receipt is stale.');
  const revocationLedger = JSON.parse(fs.readFileSync(path.join(repositoryRoot,
    manifest.lifecyclePolicy.revocationLedger), 'utf8'));
  const revocationTrustRegistry = JSON.parse(fs.readFileSync(path.join(repositoryRoot,
    manifest.lifecyclePolicy.revocationTrustRegistry), 'utf8'));
  const assessment = lifecycle.assess({ ...spec, persistedReceipt, revocationLedger,
    revocationTrustRegistry, now: new Date().toISOString() });
  lifecycle.assertCurrent(assessment);
  assert.equal(assessment.authorizesPromotion, false);
  assertFailClosed(spec);
  console.log('Foundational principles: 19/19 score 4 in the declared bounded scope.');
  console.log(`QUALIFICATION_STATUS=${assessment.status};VALID_UNTIL=${assessment.validUntil}`);
  console.log(`QUALIFICATION_RECEIPT=${JSON.stringify(receipt)}`);
}

if (require.main === module) main();
module.exports = { main };
