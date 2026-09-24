'use strict';

const assert = require('assert');
const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const { migrateHolobiontSessions } = require('../src/db/migrations/migrateHolobiontSessions');
const { migrateHolobiontContracts } = require('../src/db/migrations/migrateHolobiontContracts');
const store = require('../src/services/holobionte/holobiontStore');
const constitutionService = require('../src/services/holobionte/host/hostConstitutionService');
const contracts = require('../src/services/holobionte/contracts/symbiosisContractService');

async function fixture(db) {
  await migrateHolobiontSessions(db);
  await migrateHolobiontContracts(db);
  const session = await store.createSession(db, { hostId: 'host-contract', missionId: 'mission-contract' });
  await store.appendEvent(db, {
    holobiontId: session.holobiontId, eventType: 'SYMBIONT_DISCOVERED', expectedRevision: 1,
    payload: { symbiontId: 'sym-contract', symbiont: { role: 'analyst' } }
  });
  const constitution = constitutionService.createHostConstitution({
    hostId: session.hostId, identity: 'contract-host', maxDependencyPerSymbiont: 0.6,
    privacyPolicy: { restricted: ['credentials'] }
  });
  await constitutionService.updateConstitution(db, {
    holobiontId: session.holobiontId, constitution, expectedRevision: 2
  });
  return session.holobiontId;
}

function contractInput(holobiontId, overrides = {}) {
  return {
    holobiontId, expectedSessionRevision: 3, actorId: 'user-test',
    contract: {
      hostId: 'host-contract', symbiontId: 'sym-contract', capabilitiesOffered: ['summarize'],
      resourcesRequested: { tokens: 100 }, inputs: { report: 'text' }, outputs: { summary: 'text' },
      authorityScope: { level: 'CAPABILITY', actions: ['summarize'] }, toolLeases: ['read_report'],
      dataAccess: ['report'], privacyBoundary: {}, evidenceRequirements: ['source-links'],
      expectedBenefit: { quality: 'improved' }, maxCost: { tokens: 200 }, immunePolicy: {},
      adaptationPolicy: {}, transmissionPolicy: 'NEVER_INHERIT',
      terminationConditions: ['mission-complete'], dependencyCeiling: 0.5,
      ...overrides
    }
  };
}

async function testContractLifecycle(db) {
  const holobiontId = await fixture(db);
  const created = await contracts.createContract(db, contractInput(holobiontId));
  assert.strictEqual(created.revision, 1);
  assert.strictEqual((await contracts.authorizeSymbiontWork(db, {
    holobiontId, symbiontId: 'sym-contract', capability: 'summarize', toolName: 'read_report'
  })).allowed, true);
  await assert.rejects(() => contracts.authorizeSymbiontWork(db, {
    holobiontId, symbiontId: 'sym-contract', capability: 'deploy'
  }), { code: 'HOLOBIONT_CAPABILITY_OUT_OF_SCOPE' });
  await assert.rejects(() => contracts.authorizeSymbiontWork(db, {
    holobiontId, symbiontId: 'sym-contract', capability: 'summarize', toolName: 'write_file'
  }), { code: 'HOLOBIONT_TOOL_LEASE_REQUIRED' });
  const revoked = await contracts.revokeContract(db, {
    holobiontId, symbiontId: 'sym-contract', expectedContractRevision: 1, reason: 'mission ended'
  });
  assert.strictEqual(revoked.status, 'REVOKED');
  assert.strictEqual((await contracts.listContractHistory(db, created.contractId)).length, 2);
  await assert.rejects(() => contracts.authorizeSymbiontWork(db, {
    holobiontId, symbiontId: 'sym-contract', capability: 'summarize'
  }), { code: 'HOLOBIONT_CONTRACT_REQUIRED' });
  await assert.rejects(() => db.run('UPDATE holobiont_symbiosis_contracts SET status = ? WHERE revision = 1', 'REVOKED'));
  await assert.rejects(() => db.run('DELETE FROM holobiont_symbiosis_contracts WHERE revision = 1'));
}

async function testContractBounds(db) {
  const holobiontId = await fixture(db);
  const invalidContracts = [
    { toolLeases: ['*'] },
    { dataAccess: ['credentials'] },
    { dependencyCeiling: 0.8 },
    { transmissionPolicy: 'MAGIC' },
    { authorityScope: { level: 'SYSTEM', actions: ['anything'] } }
  ];
  for (const invalid of invalidContracts) {
    await assert.rejects(() => contracts.createContract(db, contractInput(holobiontId, invalid)));
  }
}

async function run() {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  try {
    await testContractLifecycle(db);
    await testContractBounds(db);
  } finally {
    await db.close();
  }
  console.log('✅ Holobiont SymbiosisContract tests passed.');
}

run().catch((error) => {
  console.error('❌ Holobiont SymbiosisContract tests failed:', error);
  process.exitCode = 1;
});
