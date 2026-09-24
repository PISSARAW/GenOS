'use strict';

const assert = require('assert');
const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const { migrateHolobiontSessions } = require('../src/db/migrations/migrateHolobiontSessions');
const { migrateHolobiontContracts } = require('../src/db/migrations/migrateHolobiontContracts');
const store = require('../src/services/holobionte/holobiontStore');
const constitution = require('../src/services/holobionte/host/hostConstitutionService');
const acquisition = require('../src/services/holobionte/transmission/horizontalAcquisitionService');
const admission = require('../src/services/holobionte/symbionts/symbiontAdmissionService');

function contractFor(session, symbiontId) {
  return {
    hostId: session.hostId, symbiontId, capabilitiesOffered: ['review'],
    resourcesRequested: {}, inputs: {}, outputs: {},
    authorityScope: { level: 'CAPABILITY', actions: ['review'] },
    toolLeases: ['read_diff'], dataAccess: ['diff'], privacyBoundary: {},
    evidenceRequirements: ['review-proof'], expectedBenefit: { quality: 'higher' },
    maxCost: { tokens: 100 }, immunePolicy: {}, adaptationPolicy: {},
    transmissionPolicy: 'HORIZONTAL_OK', terminationConditions: ['mission-complete'],
    dependencyCeiling: 0.4
  };
}

async function prepareHost(db, hostId, transmissionPolicy) {
  const session = await store.createSession(db, { hostId, missionId: `mission-${hostId}` });
  const hostConstitution = constitution.createHostConstitution({
    hostId, identity: `identity-${hostId}`, transmissionPolicy
  });
  await constitution.updateConstitution(db, {
    holobiontId: session.holobiontId, constitution: hostConstitution, expectedRevision: 1
  });
  return store.getSession(db, session.holobiontId);
}

async function testAcquisitionTrialAndAdmission(db) {
  const session = await prepareHost(db, 'horizontal-host', 'HORIZONTAL_OK');
  const result = await acquisition.acquireHorizontally(db, {
    holobiontId: session.holobiontId, expectedSessionRevision: session.revision,
    source: { type: 'PLUGIN_REGISTRY', reference: 'registry:reviewer@2' },
    symbiont: { id: 'external-reviewer', definition: { version: 2, capabilities: ['review'] } },
    contract: contractFor(session, 'external-reviewer'), capability: 'review',
    toolName: 'read_diff', dataAccess: ['diff'],
    evidenceRefs: ['proof:registry-signature'], verifierId: 'host-reviewer'
  });
  assert.strictEqual(result.status, 'TRIAL');
  assert.strictEqual(result.trial.status, 'TRIAL');
  const trialSession = await store.getSession(db, session.holobiontId);
  const candidate = trialSession.candidateSymbionts[0];
  assert.strictEqual(candidate.status, 'TRIAL');
  assert.strictEqual(candidate.acquisition.mode, 'HORIZONTAL');
  assert(candidate.quarantineRelease.immuneReview.allowed);
  const transitions = trialSession.events.map((item) => item.eventType);
  assert(transitions.indexOf('SYMBIONT_DISCOVERED') < transitions.indexOf('SYMBIONT_QUARANTINED'));
  assert(transitions.includes('HORIZONTAL_ACQUISITION'));
  assert(transitions.indexOf('SYMBIONT_QUARANTINED') < transitions.indexOf('HORIZONTAL_ACQUISITION'));
  const evaluated = await admission.evaluateTrial(db, {
    holobiontId: session.holobiontId, symbiontId: 'external-reviewer',
    expectedSessionRevision: trialSession.revision, contributionScore: 0.9,
    evidenceRefs: ['proof:successful-review-trial'], contractCompliant: true
  });
  assert.strictEqual(evaluated.decision, 'ADMITTED');
}

async function testRequiredVerticalPolicy(db) {
  const session = await prepareHost(db, 'vertical-only-host', 'VERTICAL_REQUIRED');
  await assert.rejects(() => acquisition.acquireHorizontally(db, {
    holobiontId: session.holobiontId, expectedSessionRevision: session.revision,
    source: { type: 'MODEL_REGISTRY', reference: 'model:reviewer' },
    symbiont: { id: 'must-not-enter' }, contract: contractFor(session, 'must-not-enter'),
    capability: 'review', evidenceRefs: ['proof:model'], verifierId: 'host-reviewer'
  }), { code: 'HOLOBIONT_TRANSMISSION_CONFLICT' });
  assert.strictEqual((await store.getSession(db, session.holobiontId)).candidateSymbionts.length, 0);
}

async function run() {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  try {
    await migrateHolobiontSessions(db);
    await migrateHolobiontContracts(db);
    await testAcquisitionTrialAndAdmission(db);
    await testRequiredVerticalPolicy(db);
  } finally {
    await db.close();
  }
  console.log('✅ Holobiont horizontal acquisition tests passed.');
}

run().catch((error) => {
  console.error('❌ Holobiont horizontal acquisition tests failed:', error);
  process.exitCode = 1;
});
