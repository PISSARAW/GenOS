'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const path = require('node:path');
const qualification = require('../src/services/foundationalPrincipleQualification');
const admission = require('../src/services/foundationalQualificationAdmission');
const revocations = require('../src/services/foundationalRevocationAuthority');
const { fingerprint } = require('../src/services/stateFingerprint');

const NOW = '2026-10-18T12:00:00.000Z';

function observations(manifest) {
  return Object.fromEntries(manifest.evidenceSuite.map((test) => [test, {
    exitCode: 0, revision: manifest.qualificationRevision,
    observedAt: '2026-10-18T11:59:00.000Z',
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
  const pair = crypto.generateKeyPairSync('ed25519');
  const trust = { schema: revocations.TRUST_SCHEMA, authorities: [{ id: 'qualification-gate',
    status: 'active', publicKey: pair.publicKey.export({ type: 'spki', format: 'pem' }) }] };
  return { repositoryRoot, manifest, observations: evidence, persistedReceipt,
    revocationLedger: { schema: revocations.LEDGER_SCHEMA, revocations: [] },
    revocationTrustRegistry: trust, issuer: { id: 'qualification-gate',
      privateKey: pair.privateKey },
    request: { consumerId: 'release-gate', purpose: 'qualification-read', ttlMs: 60000 },
    now: NOW };
}

function signedRevocation(receiptHash) {
  const pair = crypto.generateKeyPairSync('ed25519');
  const entry = revocations.issue({ receiptHash, authorityId: 'release-authority',
    reason: 'independent-counter-evidence', sequence: 1,
    revokedAt: '2026-10-18T11:59:30.000Z', privateKey: pair.privateKey });
  const trustRegistry = { schema: revocations.TRUST_SCHEMA, authorities: [{
    id: 'release-authority', status: 'active',
    publicKey: pair.publicKey.export({ type: 'spki', format: 'pem' }) }] };
  return { entry, trustRegistry };
}

function main() {
  const input = fixture();
  const lease = admission.admit(input);
  assert.equal(lease.status, 'admitted');
  assert.equal(lease.authorizesPromotion, false);
  assert.equal(lease.expiresAt, '2026-10-18T12:01:00.000Z');
  admission.assertUsable({ admission: lease, consumerId: 'release-gate',
    now: '2026-10-18T12:00:59.999Z', trustRegistry: input.revocationTrustRegistry });
  assert.throws(() => admission.assertUsable({ admission: lease,
    consumerId: 'operator-audit', now: NOW,
    trustRegistry: input.revocationTrustRegistry }),
  { code: 'FOUNDATION_ADMISSION_CONSUMER_DENIED' });
  assert.throws(() => admission.assertUsable({ admission: lease,
    consumerId: 'release-gate', now: lease.expiresAt,
    trustRegistry: input.revocationTrustRegistry }),
  { code: 'FOUNDATION_ADMISSION_EXPIRED' });
  const changed = { ...lease, purpose: 'changed' };
  const { admissionHash: _oldHash, ...changedBody } = changed;
  changed.admissionHash = fingerprint(changedBody);
  assert.throws(() => admission.assertUsable({ admission: changed,
    consumerId: 'release-gate', now: NOW,
    trustRegistry: input.revocationTrustRegistry }), { code: 'FOUNDATION_ADMISSION_INVALID' });

  const signed = signedRevocation(input.persistedReceipt.receiptHash);
  const revoked = { ...input,
    revocationLedger: { schema: revocations.LEDGER_SCHEMA, revocations: [signed.entry] },
    revocationTrustRegistry: signed.trustRegistry };
  assert.throws(() => admission.admit(revoked),
    { code: 'FOUNDATION_QUALIFICATION_NOT_CURRENT' });

  const forged = { ...signed.entry, signature: Buffer.alloc(64).toString('base64') };
  const inspected = revocations.inspect({ ledger: { schema: revocations.LEDGER_SCHEMA,
    revocations: [forged] }, trustRegistry: signed.trustRegistry, now: NOW });
  assert.equal(inspected.valid, false);
  assert.equal(inspected.reason, 'FOUNDATION_REVOCATION_SIGNATURE_INVALID');
  assert.throws(() => admission.admit({ ...input, revocationLedger:
    { schema: revocations.LEDGER_SCHEMA, revocations: [forged] },
    revocationTrustRegistry: signed.trustRegistry }),
  { code: 'FOUNDATION_QUALIFICATION_NOT_CURRENT' });
  console.log('Foundational admission: bounded lease and authenticated revocation fail closed.');
}

if (require.main === module) main();
module.exports = { main };
