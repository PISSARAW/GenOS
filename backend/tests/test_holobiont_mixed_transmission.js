'use strict';

const assert = require('assert');
const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const { migrateHolobiontSessions } = require('../src/db/migrations/migrateHolobiontSessions');
const { migrateHolobiontContracts } = require('../src/db/migrations/migrateHolobiontContracts');
const store = require('../src/services/holobionte/holobiontStore');
const constitution = require('../src/services/holobionte/host/hostConstitutionService');
const contracts = require('../src/services/holobionte/contracts/symbiosisContractService');
const admission = require('../src/services/holobionte/symbionts/symbiontAdmissionService');
const mixed = require('../src/services/holobionte/transmission/mixedTransmissionService');

function contractFor(hostId, symbiontId, transmissionPolicy) {
  return {
    hostId, symbiontId, capabilitiesOffered: ['review'], dependencyCeiling: 0.4,
    resourcesRequested: {}, inputs: {}, outputs: {},
    authorityScope: { level: 'CAPABILITY', actions: ['review'] },
    toolLeases: [], dataAccess: [], privacyBoundary: {}, evidenceRequirements: ['review-proof'],
    expectedBenefit: { quality: 'higher' }, maxCost: {}, immunePolicy: {}, adaptationPolicy: {},
    transmissionPolicy, terminationConditions: ['mission-complete']
  };
}

async function addResident(input) {
  const { db, session, symbiontId, transmissionPolicy } = input;
  let current = await store.getSession(db, session.holobiontId);
  await store.appendEvent(db, {
    holobiontId: current.holobiontId, eventType: 'SYMBIONT_DISCOVERED',
    expectedRevision: current.revision,
    payload: { symbiontId, symbiont: { id: symbiontId, definition: { version: 1 }, status: 'CANDIDATE' } }
  });
  current = await store.getSession(db, current.holobiontId);
  await contracts.createContract(db, {
    holobiontId: current.holobiontId, expectedSessionRevision: current.revision,
    contract: contractFor(current.hostId, symbiontId, transmissionPolicy)
  });
  await store.appendEvent(db, {
    holobiontId: current.holobiontId, eventType: 'SYMBIONT_ADMITTED',
    expectedRevision: current.revision, payload: { symbiontId, receipt: { receiptId: `receipt-${symbiontId}` } }
  });
}

async function setupParent(db) {
  const session = await store.createSession(db, { hostId: 'mixed-parent', scope: 'PERSISTENT' });
  const hostConstitution = constitution.createHostConstitution({
    hostId: session.hostId, identity: 'mixed-lineage', transmissionPolicy: 'HORIZONTAL_OK'
  });
  await constitution.updateConstitution(db, {
    holobiontId: session.holobiontId, constitution: hostConstitution, expectedRevision: 1
  });
  await addResident({ db, session, symbiontId: 'core-security', transmissionPolicy: 'VERTICAL_REQUIRED' });
  await addResident({ db, session, symbiontId: 'context-parser', transmissionPolicy: 'HORIZONTAL_OK' });
  return store.getSession(db, session.holobiontId);
}

async function testCoreAndPeriphery(db) {
  const parent = await setupParent(db);
  const result = await mixed.transmitMixedGeneration(db, {
    parentHolobiontId: parent.holobiontId, expectedParentRevision: parent.revision,
    childHostId: 'mixed-child', generation: 2, evidenceRefs: ['proof:lineage'],
    horizontalAcquisitions: [{
      source: { type: 'MODEL_REGISTRY', reference: 'model:context-parser@3' },
      symbiont: { id: 'context-parser', definition: { version: 3, context: 'pdf' } },
      contract: contractFor('mixed-child', 'context-parser', 'HORIZONTAL_OK'),
      capability: 'review', evidenceRefs: ['proof:model-review'], verifierId: 'host-verifier'
    }]
  });
  assert.strictEqual(result.verticalResults.find((item) => item.symbiontId === 'core-security').status, 'CANDIDATE');
  assert.strictEqual(result.verticalResults.find((item) => item.symbiontId === 'context-parser').reason, 'HORIZONTAL_ACQUISITION_REQUIRED');
  assert.strictEqual(result.horizontalResults[0].status, 'TRIAL');
  assert(result.child.candidateSymbionts.some((item) => item.id === 'core-security' && item.status === 'CANDIDATE'));
  assert(result.child.candidateSymbionts.some((item) => item.id === 'context-parser' && item.status === 'TRIAL'));
  assert.strictEqual(result.transmissionHistory.length, 1);
  assert.strictEqual(result.transmissionHistory[0].symbiontId, 'context-parser');
  const evaluated = await admission.evaluateTrial(db, {
    holobiontId: result.child.holobiontId, symbiontId: 'context-parser',
    expectedSessionRevision: result.child.revision, contributionScore: 0.85,
    evidenceRefs: ['proof:context-parser-trial'], contractCompliant: true
  });
  assert.strictEqual(evaluated.decision, 'ADMITTED');
}

async function run() {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  try {
    await migrateHolobiontSessions(db);
    await migrateHolobiontContracts(db);
    await testCoreAndPeriphery(db);
  } finally {
    await db.close();
  }
  console.log('✅ Holobiont mixed transmission tests passed.');
}

run().catch((error) => {
  console.error('❌ Holobiont mixed transmission tests failed:', error);
  process.exitCode = 1;
});
