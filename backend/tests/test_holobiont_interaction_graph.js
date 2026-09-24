'use strict';

const assert = require('assert');
const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const { migrateHolobiontSessions } = require('../src/db/migrations/migrateHolobiontSessions');
const { migrateHolobiontContracts } = require('../src/db/migrations/migrateHolobiontContracts');
const { migrateHolobiontMemory } = require('../src/db/migrations/migrateHolobiontMemory');
const store = require('../src/services/holobionte/holobiontStore');
const constitution = require('../src/services/holobionte/host/hostConstitutionService');
const contracts = require('../src/services/holobionte/contracts/symbiosisContractService');
const graph = require('../src/services/holobionte/interactions/symbiontInteractionGraph');

function contractFor(input) {
  return {
    hostId: input.hostId, symbiontId: input.symbiontId,
    capabilitiesOffered: [input.capability], dependencyCeiling: 0.3,
    resourcesRequested: {}, inputs: {}, outputs: {},
    authorityScope: { level: 'CAPABILITY', actions: [input.capability] },
    toolLeases: [], dataAccess: [], privacyBoundary: {}, evidenceRequirements: ['relation-proof'],
    expectedBenefit: { quality: 'higher' }, maxCost: {}, immunePolicy: {}, adaptationPolicy: {},
    transmissionPolicy: 'NEVER_INHERIT', terminationConditions: ['mission-complete']
  };
}

async function addResident(input) {
  const current = await store.getSession(input.db, input.session.holobiontId);
  await store.appendEvent(input.db, {
    holobiontId: input.session.holobiontId, eventType: 'SYMBIONT_DISCOVERED',
    expectedRevision: current.revision, payload: { symbiontId: input.symbiontId, symbiont: { id: input.symbiontId } }
  });
  const discovered = await store.getSession(input.db, input.session.holobiontId);
  await contracts.createContract(input.db, {
    holobiontId: input.session.holobiontId, expectedSessionRevision: discovered.revision,
    contract: contractFor({ hostId: input.session.hostId, symbiontId: input.symbiontId, capability: input.capability })
  });
  await store.appendEvent(input.db, {
    holobiontId: input.session.holobiontId, eventType: 'SYMBIONT_ADMITTED',
    expectedRevision: discovered.revision, payload: { symbiontId: input.symbiontId, receipt: { receiptId: input.symbiontId } }
  });
}

async function setup(db) {
  const session = await store.createSession(db, { hostId: 'interaction-host', missionId: 'interaction-mission' });
  const hostConstitution = constitution.createHostConstitution({ hostId: session.hostId, identity: 'interaction-graph' });
  await constitution.updateConstitution(db, {
    holobiontId: session.holobiontId, constitution: hostConstitution, expectedRevision: 1
  });
  await addResident({ db, session, symbiontId: 'retriever', capability: 'retrieve' });
  await addResident({ db, session, symbiontId: 'verifier', capability: 'verify' });
  return store.getSession(db, session.holobiontId);
}

async function testVerifiedEdge(db) {
  const session = await setup(db);
  const relation = await graph.recordInteraction(db, {
    holobiontId: session.holobiontId, expectedSessionRevision: session.revision,
    fromSymbiontId: 'retriever', toSymbiontId: 'verifier', relation: 'VERIFIES',
    fromCapability: 'retrieve', toCapability: 'verify',
    evidenceRefs: ['proof:retrieval', 'proof:verification'], verifierId: 'host-verifier'
  });
  assert.strictEqual(relation.accepted, true);
  const snapshot = await graph.buildSymbiontInteractionGraph(db, { holobiontId: session.holobiontId });
  assert.deepStrictEqual(snapshot.nodes, ['retriever', 'verifier']);
  assert.strictEqual(snapshot.edges[0].relation, 'VERIFIES');
  assert.strictEqual(snapshot.edges[0].promotionAuthority, 'HOST');
  assert.strictEqual(graph.RELATIONS.length, 8);
}

async function run() {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  try {
    await migrateHolobiontSessions(db);
    await migrateHolobiontContracts(db);
    await migrateHolobiontMemory(db);
    await testVerifiedEdge(db);
  } finally {
    await db.close();
  }
  console.log('✅ Holobiont interaction graph tests passed.');
}

run().catch((error) => {
  console.error('❌ Holobiont interaction graph tests failed:', error);
  process.exitCode = 1;
});
