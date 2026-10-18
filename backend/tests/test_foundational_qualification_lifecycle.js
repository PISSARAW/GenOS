'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const path = require('node:path');
const qualification = require('../src/services/foundationalPrincipleQualification');
const lifecycle = require('../src/services/foundationalQualificationLifecycle');
const revocations = require('../src/services/foundationalRevocationAuthority');

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
  const revocationTrustRegistry = { schema: lifecycle.TRUST_SCHEMA, authorities: [] };
  return { repositoryRoot, manifest, observations: evidence, persistedReceipt,
    revocationLedger, revocationTrustRegistry, now: NOW };
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

  const pair = crypto.generateKeyPairSync('ed25519');
  const revocation = revocations.issue({ receiptHash: input.persistedReceipt.receiptHash,
    authorityId: 'mainteneurs-genos', reason: 'contre-preuve-confirmee', sequence: 1,
    revokedAt: '2026-10-18T11:58:00.000Z', privateKey: pair.privateKey });
  const trust = { schema: lifecycle.TRUST_SCHEMA, authorities: [{ id: 'mainteneurs-genos',
    status: 'active', publicKey: pair.publicKey.export({ type: 'spki', format: 'pem' }) }] };
  const revoked = lifecycle.assess({ ...input, revocationLedger:
    { schema: lifecycle.LEDGER_SCHEMA, revocations: [revocation] },
    revocationTrustRegistry: trust });
  assert.equal(revoked.status, 'revoked');
  assert.equal(revoked.effectiveScore, null);
  assert.ok(revoked.reasons.includes('qualification-revoked'));
  assert.throws(() => lifecycle.assertCurrent(revoked),
    { code: 'FOUNDATION_QUALIFICATION_NOT_CURRENT' });
  console.log('Foundational qualification lifecycle: freshness, drift and revocation fail closed.');
}

if (require.main === module) main();
module.exports = { main };
