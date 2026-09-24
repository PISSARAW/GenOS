'use strict';

const assert = require('assert');
const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const { migrateHolobiontSessions } = require('../src/db/migrations/migrateHolobiontSessions');
const store = require('../src/services/holobionte/holobiontStore');
const constitutionService = require('../src/services/holobionte/host/hostConstitutionService');

function fixture() {
  return constitutionService.createHostConstitution({
    hostId: 'host-constitution-test',
    identity: 'release-host',
    objectives: ['deploy safely'],
    nonNegotiableInvariants: ['data-integrity'],
    authorityModel: 'central-host',
    riskTolerance: 'low',
    privacyPolicy: { restricted: ['secrets'] },
    evidencePolicy: { required: ['tests', 'rollback'] },
    essentialCapabilities: ['deploy', 'verify'],
    maxDependencyPerSymbiont: 0.65,
    transmissionPolicy: 'never_inherit'
  });
}

async function testConstitutionPersistence(db) {
  const constitution = fixture();
  const session = await store.createSession(db, {
    hostId: constitution.hostId, missionId: 'constitution-mission'
  });
  const updated = await constitutionService.updateConstitution(db, {
    holobiontId: session.holobiontId, constitution, expectedRevision: 1, actorId: 'user-test'
  });
  assert.strictEqual(updated.session.revision, 2);
  assert.strictEqual(updated.session.constitution.identity, 'release-host');
  const row = await db.get('SELECT constitution_id FROM holobiont_sessions WHERE holobiont_id = ?', session.holobiontId);
  assert.strictEqual(row.constitution_id, constitution.constitutionId);
}

function testAuthorityAndAmendments() {
  const constitution = fixture();
  assert.throws(() => constitutionService.authorizeHostDecision({
    constitution, changedInvariants: ['data-integrity']
  }), { code: 'HOLOBIONTE_CONSTITUTIONAL_VETO' });
  assert.throws(() => constitutionService.authorizeHostDecision({
    constitution, requestedAuthority: 'SYSTEM'
  }), { code: 'HOLOBIONTE_AUTHORITY_ESCALATION' });
  assert.throws(() => constitutionService.applyAmendment({
    current: constitution, changes: { riskTolerance: 'HIGH' }, approvedBy: 'HOST', reason: 'self approval'
  }), { code: 'HOLOBIONTE_AMENDMENT_AUTHORITY_REQUIRED' });
  const amended = constitutionService.applyAmendment({
    current: constitution, changes: { riskTolerance: 'HIGH' }, approvedBy: 'USER', reason: 'approved policy change'
  });
  assert.strictEqual(amended.revision, constitution.revision + 1);
  assert.strictEqual(amended.authorityCeiling, 'HOST');
  assert.strictEqual(amended.lastAmendment.approvedBy, 'USER');
}

async function run() {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  await migrateHolobiontSessions(db);
  await testConstitutionPersistence(db);
  testAuthorityAndAmendments();
  await db.close();
  console.log('✅ Holobiont Host Constitution tests passed.');
}

run().catch((error) => {
  console.error('❌ Holobiont Host Constitution tests failed:', error);
  process.exitCode = 1;
});
