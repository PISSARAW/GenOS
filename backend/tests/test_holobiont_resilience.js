'use strict';

const assert = require('assert');
const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const { migrateHolobiontSessions } = require('../src/db/migrations/migrateHolobiontSessions');
const { migrateHolobiontContracts } = require('../src/db/migrations/migrateHolobiontContracts');
const store = require('../src/services/holobionte/holobiontStore');
const constitutionService = require('../src/services/holobionte/host/hostConstitutionService');
const contracts = require('../src/services/holobionte/contracts/symbiosisContractService');
const resilience = require('../src/services/holobionte/resilience/holobiontResilienceService');

function contract(input) {
  const { hostId, symbiontId, capabilities, dependencyCeiling } = input;
  return {
    hostId, symbiontId, capabilitiesOffered: capabilities, dependencyCeiling,
    resourcesRequested: {}, inputs: {}, outputs: {},
    authorityScope: { level: 'CAPABILITY', actions: capabilities }, toolLeases: [], dataAccess: [],
    privacyBoundary: {}, evidenceRequirements: ['test-result'], expectedBenefit: { quality: 'higher' },
    maxCost: {}, immunePolicy: {}, adaptationPolicy: {}, transmissionPolicy: 'NEVER_INHERIT',
    terminationConditions: ['mission-done']
  };
}

async function setup(db) {
  await migrateHolobiontSessions(db);
  await migrateHolobiontContracts(db);
  const session = await store.createSession(db, {
    hostId: 'host-resilience', missionId: 'mission-resilience',
    residentSymbionts: [{ id: 'sym-a', status: 'RESIDENT' }, { id: 'sym-b', status: 'RESIDENT' }],
    phenotype: { capabilities: ['deploy'] }
  });
  const constitution = constitutionService.createHostConstitution({
    hostId: session.hostId, identity: 'resilience-host',
    essentialCapabilities: ['translate', 'review', 'deploy'], maxDependencyPerSymbiont: 0.5
  });
  await constitutionService.updateConstitution(db, {
    holobiontId: session.holobiontId, constitution, expectedRevision: 1
  });
  await contracts.createContract(db, {
    holobiontId: session.holobiontId, expectedSessionRevision: 2,
    contract: contract({ hostId: session.hostId, symbiontId: 'sym-a', capabilities: ['translate', 'review'], dependencyCeiling: 0.4 })
  });
  await contracts.createContract(db, {
    holobiontId: session.holobiontId, expectedSessionRevision: 2,
    contract: contract({ hostId: session.hostId, symbiontId: 'sym-b', capabilities: ['translate'], dependencyCeiling: 0.3 })
  });
  return session.holobiontId;
}

async function testFunctionalNiches(db, holobiontId) {
  const report = await resilience.analyzeSymbioticResilience(db, { holobiontId });
  assert.deepStrictEqual(report.missingEssential, []);
  assert.deepStrictEqual(report.keystoneSymbionts, ['sym-a']);
  const translate = report.niches.find((item) => item.capability === 'translate');
  assert.strictEqual(translate.redundancy, 2);
  assert.strictEqual(translate.primary, 'sym-b');
  assert.deepStrictEqual(translate.backups, ['sym-a']);
  assert.strictEqual(report.niches.find((item) => item.capability === 'deploy').primary, 'HOST');
}

function testDependencyControl() {
  const result = resilience.evaluateDependencyControl({
    constitution: { maxDependencyPerSymbiont: 0.5 },
    contracts: [
      { symbiontId: 'sym-a', dependencyCeiling: 0.4 },
      { symbiontId: 'sym-b', dependencyCeiling: 0.3 }
    ],
    observations: [
      { symbiontId: 'sym-a', dependencyScore: 0.6, replaceability: 0.2,
        backupAvailable: true, evidenceRefs: ['ledger:contributions'] },
      { symbiontId: 'sym-b', dependencyScore: 0.25, replaceability: 0.8,
        backupAvailable: false, evidenceRefs: ['ledger:contributions'] }
    ]
  });
  assert.strictEqual(result.allowed, false);
  assert.deepStrictEqual(result.violations, ['sym-a']);
  assert.strictEqual(result.evaluations[0].action, 'USE_RESIDENT_BACKUP');
  assert.strictEqual(result.evaluations[1].action, 'MAINTAIN');
  assert.throws(() => resilience.evaluateDependencyControl({
    constitution: { maxDependencyPerSymbiont: 0.5 }, contracts: [],
    observations: [{ symbiontId: 'sym-x', dependencyScore: 0.2, replaceability: 0.5 }]
  }), { code: 'HOLOBIONT_RESILIENCE_INVALID' });
}

async function run() {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  try {
    const holobiontId = await setup(db);
    await testFunctionalNiches(db, holobiontId);
    testDependencyControl();
  } finally {
    await db.close();
  }
  console.log('✅ Holobiont resilience tests passed.');
}

run().catch((error) => {
  console.error('❌ Holobiont resilience tests failed:', error);
  process.exitCode = 1;
});
