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
const runtime = require('../src/services/holobionte/runtime/holobiontRuntime');
const controller = require('../src/services/holobionte/runtime/holobiontController');

async function setup(db) {
  await migrateHolobiontSessions(db);
  await migrateHolobiontContracts(db);
  await migrateHolobiontMemory(db);
  const session = await store.createSession(db, {
    hostId: 'runtime-host', missionId: 'runtime-mission', constitution: null
  });
  const hostConstitution = constitution.createHostConstitution({ hostId: session.hostId, identity: 'runtime-host' });
  await constitution.updateConstitution(db, {
    holobiontId: session.holobiontId, constitution: hostConstitution, expectedRevision: session.revision
  });
  await store.appendEvent(db, {
    holobiontId: session.holobiontId, expectedRevision: 2,
    eventType: 'SYMBIONT_DISCOVERED',
    payload: { symbiontId: 'resident-planner', symbiont: { capabilities: ['planning'] } }
  });
  await contracts.createContract(db, {
    holobiontId: session.holobiontId, expectedSessionRevision: 3,
    contract: {
      hostId: session.hostId, symbiontId: 'resident-planner', capabilitiesOffered: ['planning'],
      dependencyCeiling: 0.3, resourcesRequested: { tokens: 20 }, inputs: {}, outputs: {},
      authorityScope: { level: 'CAPABILITY', actions: ['planning'] }, toolLeases: [], dataAccess: [],
      privacyBoundary: {}, evidenceRequirements: ['planning-proof'], expectedBenefit: { quality: 'higher' },
      maxCost: { tokens: 20 }, immunePolicy: {}, adaptationPolicy: {},
      transmissionPolicy: 'NEVER_INHERIT', terminationConditions: ['mission-end']
    }
  });
  await store.appendEvent(db, {
    holobiontId: session.holobiontId, expectedRevision: 3,
    eventType: 'SYMBIONT_ADMITTED', payload: { symbiontId: 'resident-planner', receipt: { receiptId: 'admission' } }
  });
  return store.getSession(db, session.holobiontId);
}

async function run() {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  try {
    const session = await setup(db);
    const dependencies = {
      executeCapability: async () => ({ accepted: true, contribution: { contributionScore: 0.9 } }),
      assessHealth: async () => ({ nextAction: null, automaticActionApplied: false })
    };
    const result = await runtime.runCycle(db, {
      holobiontId: session.holobiontId, capability: 'planning', missionId: 'runtime-mission'
    }, dependencies);
    assert.strictEqual(result.status, 'VERIFIED');
    assert.strictEqual(result.symbiontId, 'resident-planner');
    assert.strictEqual(result.health.automaticActionApplied, false);
    const gap = await runtime.runCycle(db, {
      holobiontId: session.holobiontId, capability: 'security-audit'
    }, dependencies);
    assert.strictEqual(gap.status, 'CAPABILITY_GAP');
    const ignored = await controller.handleEvent(db, { eventType: 'UNKNOWN_EVENT', payload: {} }, dependencies);
    assert.strictEqual(ignored.handled, false);
  } finally {
    await db.close();
  }
  console.log('✅ Holobiont runtime tests passed.');
}

run().catch((error) => {
  console.error('❌ Holobiont runtime tests failed:', error);
  process.exitCode = 1;
});
