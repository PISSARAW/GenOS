'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const path = require('node:path');
const qualification = require('../src/services/foundationalPrincipleQualification');
const lifecycle = require('../src/services/foundationalQualificationLifecycle');

const NOW = '2026-10-18T12:00:00.000Z';
const FRESH = '2026-10-18T11:59:00.000Z';

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function observations(manifest, observedAt = FRESH) {
  return Object.fromEntries(manifest.evidenceSuite.map((test) => [test, {
    exitCode: 0, revision: manifest.qualificationRevision, observedAt,
    outputDigest: crypto.createHash('sha256').update(test).digest('hex')
  }]));
}

function fixture() {
  const repositoryRoot = path.resolve(__dirname, '..', '..');
  const manifest = qualification.readManifest(path.join(repositoryRoot, 'shared',
    'foundationalPrinciplesQualification.json'));
  const evidence = observations(manifest);
  const persistedReceipt = qualification.qualify({ repositoryRoot, manifest,
    observations: evidence });
  const revocationLedger = { schema: lifecycle.LEDGER_SCHEMA, revocations: [] };
  return { repositoryRoot, manifest, observations: evidence, persistedReceipt,
    revocationLedger, now: NOW };
}

function assertQuarantined(input, reason) {
  const result = lifecycle.assess(input);
  assert.equal(result.status, 'quarantined');
  assert.equal(result.effectiveScore, null);
  assert.ok(result.reasons.includes(reason));
  assert.throws(() => lifecycle.assertCurrent(result),
    { code: 'FOUNDATION_QUALIFICATION_NOT_CURRENT' });
}

function main() {
  const input = fixture();
  const current = lifecycle.assess(input);
  assert.equal(current.status, 'current');
  assert.equal(current.effectiveScore, 4);
  assert.equal(current.authorizesPromotion, false);
  lifecycle.assertCurrent(current);

  const drifted = clone(input.observations);
  drifted[input.manifest.evidenceSuite[0]].outputDigest = 'f'.repeat(64);
  assertQuarantined({ ...input, observations: drifted }, 'qualification-drift');

  const stale = observations(input.manifest, '2026-10-18T11:40:00.000Z');
  assertQuarantined({ ...input, observations: stale }, 'evidence-stale');

  const tampered = { ...input.persistedReceipt, sourceDigest: '0'.repeat(64) };
  assertQuarantined({ ...input, persistedReceipt: tampered }, 'persisted-receipt-invalid');

  const revocation = { receiptHash: input.persistedReceipt.receiptHash,
    authority: 'mainteneurs-genos', reason: 'contre-preuve-confirmee',
    revokedAt: '2026-10-18T11:58:00.000Z' };
  const revoked = lifecycle.assess({ ...input, revocationLedger:
    { schema: lifecycle.LEDGER_SCHEMA, revocations: [revocation] } });
  assert.equal(revoked.status, 'revoked');
  assert.equal(revoked.effectiveScore, null);
  assert.ok(revoked.reasons.includes('qualification-revoked'));
  assert.throws(() => lifecycle.assertCurrent(revoked),
    { code: 'FOUNDATION_QUALIFICATION_NOT_CURRENT' });
  console.log('Foundational qualification lifecycle: freshness, drift and revocation fail closed.');
}

if (require.main === module) main();
module.exports = { main };
