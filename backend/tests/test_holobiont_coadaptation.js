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
const memory = require('../src/services/holobionte/memory/symbioticMemoryService');
const adaptation = require('../src/services/holobionte/adaptation/hostSymbiontAdaptationService');
const contractAdaptation = require('../src/services/holobionte/adaptation/contractAdaptationService');

async function setup(db) {
  const session = await store.createSession(db, { hostId: 'coadapt-host', scope: 'PERSISTENT' });
  const hostConstitution = constitution.createHostConstitution({ hostId: session.hostId, identity: 'coadaptation' });
  await constitution.updateConstitution(db, {
    holobiontId: session.holobiontId, constitution: hostConstitution, expectedRevision: 1
  });
  await store.appendEvent(db, {
    holobiontId: session.holobiontId, eventType: 'SYMBIONT_DISCOVERED', expectedRevision: 2,
    payload: { symbiontId: 'coadapt-reviewer', symbiont: { id: 'coadapt-reviewer' } }
  });
  await contracts.createContract(db, {
    holobiontId: session.holobiontId, expectedSessionRevision: 3,
    contract: {
      hostId: session.hostId, symbiontId: 'coadapt-reviewer', capabilitiesOffered: ['review', 'classify'],
      resourcesRequested: { tokens: 50 }, inputs: {}, outputs: {},
      authorityScope: { level: 'CAPABILITY', actions: ['review', 'classify'] },
      toolLeases: ['read_diff'], dataAccess: ['source-code'], privacyBoundary: {},
      evidenceRequirements: ['review-proof'], expectedBenefit: { accuracy: 'high' },
      maxCost: { tokens: 100 }, immunePolicy: {}, adaptationPolicy: {},
      transmissionPolicy: 'NEVER_INHERIT', terminationConditions: ['task-complete'],
      dependencyCeiling: 0.5
    }
  });
  await store.appendEvent(db, {
    holobiontId: session.holobiontId, eventType: 'SYMBIONT_ADMITTED', expectedRevision: 3,
    payload: { symbiontId: 'coadapt-reviewer', receipt: { receiptId: 'coadapt-admission' } }
  });
  return store.getSession(db, session.holobiontId);
}

async function testLearningAndBoundedAdaptation(db) {
  const session = await setup(db);
  const learned = await adaptation.learnBidirectionalAdaptation(db, {
    holobiontId: session.holobiontId, expectedSessionRevision: session.revision,
    symbiontId: 'coadapt-reviewer', capability: 'review', qualityScore: 0.92,
    context: 'source review with explicit provenance', requiredInputs: ['diff', 'commit-range'],
    evidenceProduced: ['annotated-review', 'evidence-references'],
    hostOntology: 'GenOS capabilities and receipts',
    hostConventions: ['French documentation', 'append-only evidence'],
    errorPatterns: ['unreferenced claims'], preferredOutputShape: 'review JSON with citations',
    evidenceRefs: ['proof:review-result'], verifierId: 'host-verifier'
  });
  assert.strictEqual(learned.learned, true);
  assert.deepStrictEqual(learned.hostLearning.requiredContext, ['diff', 'commit-range']);
  assert.strictEqual(learned.symbiontLearning.hostOntology, 'GenOS capabilities and receipts');
  assert.strictEqual((await memory.recallMemories(db, {
    holobiontId: session.holobiontId, memoryType: 'PARTNER_REPUTATION'
  })).length, 1);
  const current = await store.getSession(db, session.holobiontId);
  const next = await contractAdaptation.adaptContract(db, {
    holobiontId: session.holobiontId, symbiontId: 'coadapt-reviewer',
    expectedSessionRevision: current.revision, expectedContractRevision: 1,
    changes: {
      capabilitiesOffered: ['review'], dataAccess: [], toolLeases: [],
      authorityScope: { level: 'CAPABILITY', actions: ['review'] },
      resourcesRequested: { tokens: 20 }, maxCost: { tokens: 40 }, dependencyCeiling: 0.2
    }, evidenceRefs: ['proof:reduced-need'], verifierId: 'host-verifier'
  });
  assert.strictEqual(next.revision, 2);
  assert.deepStrictEqual(next.capabilitiesOffered, ['review']);
  assert.deepStrictEqual(next.dataAccess, []);
  await assert.rejects(() => contractAdaptation.adaptContract(db, {
    holobiontId: session.holobiontId, symbiontId: 'coadapt-reviewer',
    expectedSessionRevision: current.revision, expectedContractRevision: 2,
    changes: { capabilitiesOffered: ['review', 'deploy'] },
    evidenceRefs: ['proof:attempted-expansion'], verifierId: 'host-verifier'
  }), { code: 'HOLOBIONT_ADAPTATION_ESCALATION' });
}

async function run() {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  try {
    await migrateHolobiontSessions(db);
    await migrateHolobiontContracts(db);
    await migrateHolobiontMemory(db);
    await testLearningAndBoundedAdaptation(db);
  } finally {
    await db.close();
  }
  console.log('✅ Holobiont co-adaptation tests passed.');
}

run().catch((error) => {
  console.error('❌ Holobiont co-adaptation tests failed:', error);
  process.exitCode = 1;
});
