'use strict';

const assert = require('node:assert/strict');
const { digest } = require('../src/services/evidenceProtocol/canonical');
const { verifyConservation, MorphConservationError } = require('../src/services/morphProtocol/conservation');
const fixture = require('./helpers/morphContractFixture');

function rejects(change, expected = /MORPH conservation/) {
  const plan = fixture.plan();
  change(plan);
  assert.throws(() => verifyConservation(plan), expected);
}

function versionAndRoster() {
  rejects((plan) => { plan.targetVersion = plan.sourceVersion; }, /version/);
  rejects((plan) => { plan.targetVersion += 1; }, /version/);
  rejects((plan) => { plan.sourceVersion = Number.MAX_SAFE_INTEGER; plan.targetVersion = Number.MAX_SAFE_INTEGER; }, /version/);
  const nodeRoster = fixture.plan({ participants: [fixture.actor('node-one'), fixture.actor('node-two')] });
  assert.equal(verifyConservation(nodeRoster).valid, true);
  assert.throws(() => verifyConservation(fixture.plan({ participants: [] })), /contract/);
  rejects((plan) => { plan.participants.push(plan.participants[0]); }, /duplicate actor/);
  rejects((plan) => { plan.targetSnapshot.members.push(plan.targetSnapshot.members[0]); }, /duplicate actor/);
}

function immutableKnowledge() {
  const fields = ['claims', 'evidence', 'provenance', 'dependencies', 'uncertainties', 'questions'];
  for (const field of fields) {
    rejects((plan) => { plan.targetSnapshot[field].pop(); }, /identifiers changed/);
    rejects((plan) => { plan.targetSnapshot[field][0].content.injectedGuarantee = true; }, /content changed/);
  }
  rejects((plan) => { plan.targetSnapshot.claims[0].content.limitations = []; }, /claims content/);
  rejects((plan) => { plan.targetSnapshot.claims[0].content.domain = 'production'; }, /claims content/);
  rejects((plan) => { plan.targetSnapshot.provenance[1].content.statisticallyIndependent = true; }, /provenance content/);
  rejects((plan) => { plan.targetSnapshot.dependencies[0].content.agents = ['agent-b']; }, /dependencies content/);
  rejects((plan) => { plan.targetSnapshot.evidence.push({ evidenceId: 'new', content: { status: 'verified' } }); }, /identifiers changed/);
}

function responsibilities() {
  for (const field of ['tasks', 'obligations', 'unknownEffects']) {
    rejects((plan) => { plan.targetSnapshot[field] = []; }, /identifiers changed/);
    rejects((plan) => { plan.targetSnapshot[field][0].content.status = 'cancelled'; }, /content changed/);
    rejects((plan) => { plan.transfers = plan.transfers.filter((entry) => entry.kind !== field); }, /explicit transfer/);
    rejects((plan) => { plan.targetSnapshot[field][0].owner = fixture.actor('absent'); }, /target owner missing/);
  }
  rejects((plan) => { plan.targetSnapshot.obligations[0].requirements = []; }, /content changed/);
  rejects((plan) => { plan.transfers[0].from = fixture.actor('wrong-source'); }, /explicit transfer/);
  rejects((plan) => { plan.transfers.push(plan.transfers[0]); }, /duplicate ownership transfer/);
  rejects((plan) => { plan.transfers[0].id = 'unrelated'; }, /explicit transfer/);
}

function permissionLimits() {
  rejects((plan) => { plan.targetSnapshot.permissions[0].resources.push('new-resource'); }, /rights expanded/);
  rejects((plan) => { plan.targetSnapshot.permissions[0].actions.push('write'); }, /rights expanded/);
  rejects((plan) => { plan.targetSnapshot.permissions[0].conditions = {}; }, /conditions changed/);
  rejects((plan) => { plan.targetSnapshot.permissions[0].conditions.expiresAt = '2099-01-01T00:00:00Z'; }, /conditions changed/);
  rejects((plan) => { plan.targetSnapshot.permissions[0].grantId = 'new-grant'; }, /new permission grant/);
  const restricted = fixture.plan();
  restricted.targetSnapshot.permissions[0].resources = ['artifact-1'];
  assert.equal(verifyConservation(restricted).valid, true);
  const removed = fixture.plan();
  removed.targetSnapshot.permissions = [];
  removed.transfers = removed.transfers.filter((entry) => entry.kind !== 'permissions');
  assert.equal(verifyConservation(removed).valid, true);
}

function resourceConservation() {
  for (const field of ['unit', 'limit', 'spent', 'reserved']) {
    rejects((plan) => { plan.targetSnapshot.budgets[0][field] = field === 'unit' ? 'euros' : 0; }, /budgets content changed/);
  }
  rejects((plan) => { plan.targetSnapshot.budgets = []; }, /budgets identifiers changed/);
  rejects((plan) => {
    for (const snapshot of [plan.sourceSnapshot, plan.targetSnapshot]) { snapshot.budgets[0].spent = 90; snapshot.budgets[0].reserved = 30; }
  }, /budget exceeds/);
}

function publishedAudiences() {
  rejects((plan) => { plan.targetSnapshot.audiences[0].recipients.push(fixture.actor('agent-d')); }, /audiences content/);
  rejects((plan) => { plan.targetSnapshot.audiences[0].recipients = [fixture.actor('agent-b')]; }, /audiences content/);
  rejects((plan) => { plan.targetSnapshot.audiences[0].contentDigest = digest('other-message'); }, /audiences content/);
  rejects((plan) => {
    const duplicate = plan.sourceSnapshot.audiences[0].recipients[0];
    plan.sourceSnapshot.audiences[0].recipients.push(duplicate);
  }, /duplicate actor/);
}

function duplicateRecords() {
  const source = fixture.snapshot();
  const kinds = Object.keys(source).filter((key) => Array.isArray(source[key]) && key !== 'members');
  for (const kind of kinds) {
    rejects((plan) => { plan.sourceSnapshot[kind].push(plan.sourceSnapshot[kind][0]); }, /duplicate/);
    rejects((plan) => { plan.targetSnapshot[kind].push(plan.targetSnapshot[kind][0]); }, /duplicate/);
  }
}

function main() {
  const plan = fixture.plan();
  const before = digest(plan);
  assert.deepEqual(verifyConservation(plan), { valid: true, planDigest: digest(plan),
    sourceDigest: digest(plan.sourceSnapshot), targetDigest: digest(plan.targetSnapshot) });
  assert.equal(digest(plan), before);
  assert.equal(new MorphConservationError('example').code, 'MORPH_CONSERVATION_INVALID');
  versionAndRoster();
  immutableKnowledge();
  responsibilities();
  permissionLimits();
  resourceConservation();
  publishedAudiences();
  duplicateRecords();
  console.log('MORPH conservation of obligations, authority, resources, provenance and audiences: PASS');
}

main();
