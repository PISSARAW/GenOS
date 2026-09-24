'use strict';

const assert = require('assert');
const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const { migrateHolobiontSessions } = require('../src/db/migrations/migrateHolobiontSessions');
const { migrateHolobiontContracts } = require('../src/db/migrations/migrateHolobiontContracts');
const { migrateHolobiontMemory } = require('../src/db/migrations/migrateHolobiontMemory');
const { migrateHolobiontLedger } = require('../src/db/migrations/migrateHolobiontLedger');
const { migrateHolobiontImmunePlane } = require('../src/db/migrations/migrateHolobiontImmunePlane');
const store = require('../src/services/holobionte/holobiontStore');
const constitution = require('../src/services/holobionte/host/hostConstitutionService');
const contracts = require('../src/services/holobionte/contracts/symbiosisContractService');
const crossFeeding = require('../src/services/holobionte/interactions/crossFeedingService');

function makeContract(input) {
  const { hostId, symbiontId, capability, evidenceRequirement } = input;
  return {
    hostId, symbiontId, capabilitiesOffered: [capability], dependencyCeiling: 0.3,
    resourcesRequested: {}, inputs: {}, outputs: {},
    authorityScope: { level: 'CAPABILITY', actions: [capability] }, toolLeases: [], dataAccess: [],
    privacyBoundary: {}, evidenceRequirements: [evidenceRequirement], expectedBenefit: { quality: 'higher' },
    maxCost: {}, immunePolicy: {}, adaptationPolicy: {}, transmissionPolicy: 'NEVER_INHERIT',
    terminationConditions: ['mission-complete']
  };
}

async function addResident(input) {
  const { db, session, symbiontId, capability, evidenceRequirement } = input;
  const current = await store.getSession(db, session.holobiontId);
  await store.appendEvent(db, {
    holobiontId: session.holobiontId, eventType: 'SYMBIONT_DISCOVERED',
    expectedRevision: current.revision, payload: { symbiontId, symbiont: { id: symbiontId } }
  });
  const discovered = await store.getSession(db, session.holobiontId);
  await contracts.createContract(db, {
    holobiontId: session.holobiontId, expectedSessionRevision: discovered.revision,
    contract: makeContract({ hostId: session.hostId, symbiontId, capability, evidenceRequirement })
  });
  await store.appendEvent(db, {
    holobiontId: session.holobiontId, eventType: 'SYMBIONT_ADMITTED',
    expectedRevision: discovered.revision,
    payload: { symbiontId, receipt: { receiptId: `admit-${symbiontId}` } }
  });
}

async function setup(db) {
  const session = await store.createSession(db, { hostId: 'cross-feed-host', missionId: 'cross-feed-mission' });
  const hostConstitution = constitution.createHostConstitution({ hostId: session.hostId, identity: 'cross-feeding' });
  await constitution.updateConstitution(db, {
    holobiontId: session.holobiontId, constitution: hostConstitution, expectedRevision: 1
  });
  await addResident({ db, session, symbiontId: 'evidence-retriever', capability: 'retrieve', evidenceRequirement: 'producer-proof' });
  await addResident({ db, session, symbiontId: 'claim-verifier', capability: 'verify', evidenceRequirement: 'consumer-proof' });
  return store.getSession(db, session.holobiontId);
}

async function testCreditIntermediateProducer(db) {
  const session = await setup(db);
  const published = await crossFeeding.publish(db, {
    holobiontId: session.holobiontId, expectedSessionRevision: session.revision,
    producerSymbiontId: 'evidence-retriever', producerCapability: 'retrieve',
    valueType: 'EVIDENCE_CORPUS', payload: { claims: ['claim-A'], evidenceIds: ['doc-17'] },
    evidenceRefs: ['producer-proof:doc-17'], verifierId: 'host-verifier'
  });
  assert.strictEqual(published.accepted, true);
  const consumed = await crossFeeding.consume(db, {
    holobiontId: session.holobiontId, expectedSessionRevision: session.revision,
    valueMemoryId: published.memoryId, consumerSymbiontId: 'claim-verifier', consumerCapability: 'verify',
    producerBenefitScore: 0.9, producerEvidenceQuality: 0.9, producerCostScore: 0.1,
    resourcesConsumed: {}, producerVerification: {
      status: 'VERIFIED', verifierId: 'host-verifier', resultHash: 'result:verified-claim',
      evidenceRefs: ['producer-proof:doc-17']
    }, consumptionEvidenceRefs: ['consumer-proof:verified-claim'], verifierId: 'host-verifier'
  });
  assert.strictEqual(consumed.accepted, true);
  const interaction = await crossFeeding.interactionGraph(db, { holobiontId: session.holobiontId });
  assert.deepStrictEqual(interaction.nodes, ['claim-verifier', 'evidence-retriever']);
  assert.strictEqual(interaction.edges[0].relation, 'SUPPLIES');
  assert.strictEqual(interaction.edges[0].producerLedgerId, consumed.producerCredit.ledgerId);
}

async function run() {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  try {
    await migrateHolobiontSessions(db);
    await migrateHolobiontContracts(db);
    await migrateHolobiontMemory(db);
    await migrateHolobiontLedger(db);
    await migrateHolobiontImmunePlane(db);
    await testCreditIntermediateProducer(db);
  } finally {
    await db.close();
  }
  console.log('✅ Holobiont cross-feeding tests passed.');
}

run().catch((error) => {
  console.error('❌ Holobiont cross-feeding tests failed:', error);
  process.exitCode = 1;
});
