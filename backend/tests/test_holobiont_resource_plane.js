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
const resources = require('../src/services/holobionte/resources/symbioticResourceService');

async function setup(db) {
  await migrateHolobiontSessions(db);
  await migrateHolobiontContracts(db);
  const session = await store.createSession(db, { hostId: 'host-resource', missionId: 'mission-resource' });
  await store.appendEvent(db, {
    holobiontId: session.holobiontId, eventType: 'SYMBIONT_DISCOVERED', expectedRevision: 1,
    payload: { symbiontId: 'sym-resource' }
  });
  const hostConstitution = constitution.createHostConstitution({
    hostId: session.hostId, identity: 'resource-host'
  });
  await constitution.updateConstitution(db, {
    holobiontId: session.holobiontId, constitution: hostConstitution, expectedRevision: 2
  });
  await contracts.createContract(db, {
    holobiontId: session.holobiontId, expectedSessionRevision: 3,
    contract: {
      hostId: session.hostId, symbiontId: 'sym-resource', capabilitiesOffered: ['analyze'],
      resourcesRequested: { tokens: 100, compute: 10 }, inputs: {}, outputs: {},
      authorityScope: { level: 'CAPABILITY', actions: ['analyze'] }, toolLeases: [], dataAccess: [],
      privacyBoundary: {}, evidenceRequirements: ['result'], expectedBenefit: { quality: 'higher' },
      maxCost: {}, immunePolicy: {}, adaptationPolicy: {}, transmissionPolicy: 'NEVER_INHERIT',
      terminationConditions: ['done'], dependencyCeiling: 0.5
    }
  });
  await admission.startAdmission(db, {
    holobiontId: session.holobiontId, symbiontId: 'sym-resource', capability: 'analyze',
    expectedSessionRevision: 3
  });
  await admission.evaluateTrial(db, {
    holobiontId: session.holobiontId, symbiontId: 'sym-resource', expectedSessionRevision: 4,
    contributionScore: 0.8, evidenceRefs: ['sha256:admission'], contractCompliant: true
  });
  await store.appendEvent(db, {
    holobiontId: session.holobiontId, eventType: 'CONTRIBUTION_VERIFIED', expectedRevision: 5,
    payload: { symbiontId: 'sym-resource', contributionScore: 0.8, evidenceRefs: ['sha256:verified-output'] }
  });
  return session.holobiontId;
}

async function testAllocationLifecycle(db, holobiontId) {
  const session = await store.getSession(db, holobiontId);
  const grant = await resources.grantResources(db, {
    holobiontId, symbiontId: 'sym-resource', expectedSessionRevision: session.revision,
    available: { tokens: 100, compute: 10 },
    policy: {
      tokens: { basal: 10, preferred: 40, maximum: 80, burstAllowance: 20 },
      compute: { basal: 1, preferred: 4, maximum: 8, burstAllowance: 2 }
    }
  });
  assert.deepStrictEqual(grant.resources, { tokens: 60, compute: 6 });
  const allocated = await store.getSession(db, holobiontId);
  assert.strictEqual(allocated.resourceState.allocations['sym-resource'].allocationId, grant.allocationId);
  assert.deepStrictEqual(allocated.resourceState.allocations['sym-resource'].resources, grant.resources);
  const revoked = await resources.revokeResources(db, {
    holobiontId, symbiontId: 'sym-resource', expectedSessionRevision: allocated.revision,
    reason: 'trial budget closed'
  });
  assert.strictEqual(revoked.revoked, true);
  assert.strictEqual((await store.getSession(db, holobiontId)).resourceState.allocations['sym-resource'], undefined);
}

async function testResourceBounds(db, holobiontId) {
  const session = await store.getSession(db, holobiontId);
  await assert.rejects(() => resources.grantResources(db, {
    holobiontId, symbiontId: 'sym-resource', expectedSessionRevision: session.revision,
    available: { tokens: 100 },
    policy: { tokens: { basal: 10, preferred: 20, maximum: 101, burstAllowance: 0 } }
  }), { code: 'HOLOBIONT_RESOURCE_CONTRACT_LIMIT' });
  await assert.rejects(() => resources.grantResources(db, {
    holobiontId, symbiontId: 'sym-resource', expectedSessionRevision: session.revision,
    available: { tokens: 5 },
    policy: { tokens: { basal: 10, preferred: 20, maximum: 30, burstAllowance: 0 } }
  }), { code: 'HOLOBIONT_RESOURCE_UNAVAILABLE' });
}

async function run() {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  try {
    const holobiontId = await setup(db);
    await testAllocationLifecycle(db, holobiontId);
    await testResourceBounds(db, holobiontId);
  } finally {
    await db.close();
  }
  console.log('✅ Holobiont Resource Plane tests passed.');
}

run().catch((error) => {
  console.error('❌ Holobiont Resource Plane tests failed:', error);
  process.exitCode = 1;
});
