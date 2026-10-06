'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const { migrateMetapopulationRuntime } = require('../src/db/migrations/migrateMetapopulationRuntime');
const api = require('../src/services/metapopulationCoordinationService');
const store = require('../src/services/metapopulation/metapopulationStore');
const brain = require('../src/services/metapopulation/runtime/regionalBrainService');
const executors = require('../src/services/metapopulation/runtime/variantActionExecutors');
const islands = require('../src/services/metapopulation/runtime/islandExecutionService');
const migrationLoop = require('../src/services/metapopulation/runtime/regionalMigrationLoopService');
const migrationStore = require('../src/services/metapopulation/migration/migrationStore');
const migration = require('../src/services/metapopulation/migration/propaguleMigrationService');
const adapters = require('../src/services/metapopulation/migration/migrationAdapterRegistry');
const corridorStore = require('../src/services/metapopulation/migration/corridorStore');
const policies = require('../src/services/metapopulation/policy/metapopulationPolicyService');
const evolution = require('../src/services/metapopulation/evolution/evolutionaryRuntimeService');

async function population(db, variant) {
  const session = await api.createMetapopulationSession('Durable execution acceptance.', { db, variant });
  const id = session.sessionId;
  for (const suffix of ['a', 'b']) {
    await api.createPatch(id, { patchId: id + suffix, environment: {}, requirements: [],
      resources: {}, carryingCapacity: 4, quality: 1, accessibility: 1 }, { db });
    await api.createDeme(id, { demeId: id + suffix, patchId: id + suffix, fitness: { score: 0.8 },
      providerId: suffix, algorithmId: suffix, population: [{ id: suffix }], generation: 0,
      localStrategies: [suffix], lineage: { founders: [suffix] } }, { db });
    await api.transitionDeme({ sessionId: id, demeId: id + suffix, status: 'ESTABLISHING' }, { db });
    await api.transitionDeme({ sessionId: id, demeId: id + suffix, status: 'ACTIVE' }, { db });
  }
  return id;
}

async function islandPersistence(db) {
  const id = await population(db, 'evolutionary');
  const context = { input: { metapopulationId: id }, options: { db,
    rustEvolution: async (request) => ({ islandName: request.islandName, generation: request.generation + 1,
      bestFitness: 0.9, meanFitness: 0.8, individuals: [{ id: 'evolved' }], verifiedCount: 1 }) } };
  const action = { type: 'EVOLVE_ISLAND', request: { demeId: id + 'a', population: [] } };
  const result = await islands.evolveIsland(action, context);
  let session = await store.loadSession(db, id);
  assert.equal(session.demes[0].providerId, 'a');
  assert.equal(session.demes[0].generation, 1);
  assert.deepEqual(session.demes[0].population, [{ id: 'evolved' }]);
  assert.equal(islands.verifyIslandResult(action, result, session), true);
  assert.equal(islands.verifyIslandResult(action, { ...result, demeId: id + 'b' }, session), false);
  const searchAction = { type: 'SEARCH_ISLAND', request: { demeId: id + 'a', solverId: 'sat', problemRef: 'problem-a' } };
  context.options.solverSearch = async (request) => ({ solverId: request.solverId, objective: 4,
    incumbentRef: 'incumbent', counterexampleRefs: [], iterations: 3 });
  await islands.searchIsland(searchAction, context);
  delete require.cache[require.resolve('../src/services/metapopulation/runtime/islandExecutionService')];
  const restarted = require('../src/services/metapopulation/runtime/islandExecutionService');
  context.options.solverSearch = async (request) => {
    assert.equal(request.state.iterations, 3);
    return { solverId: 'sat', objective: 3, incumbentRef: 'incumbent-b', counterexampleRefs: [], iterations: 2 };
  };
  const searched = await restarted.searchIsland(searchAction, context);
  session = await store.loadSession(db, id);
  assert.equal(searched.totalIterations, 5);
  assert.equal(islands.verifyIslandResult(searchAction, searched, session), true);
  assert.equal(session.demes[1].fitnessContext, undefined);
}

function propagule(id) {
  return { propaguleId: id + 'migration', type: 'STRATEGY', sourceDemeId: id + 'a', targetDemeId: id + 'b',
    payloadRef: 'strategy-a', migrationReason: 'novelty', lineageRefs: ['a'], sourceEvidence: ['evaluation'],
    provenance: { source: 'acceptance' }, sourceFitness: 0.8, novelty: 0.8, expectedReceiverGain: 0.3 };
}

async function receiverDecisionsAndResume(db) {
  const id = await population(db, 'heterogeneous_islands');
  const graph = await api.applyMigrationTopology(id, { db, policy: 'fully-connected' });
  const candidate = propagule(id);
  const corridor = graph.find((item) => item.sourceDemeId === candidate.sourceDemeId && item.targetDemeId === candidate.targetDemeId);
  let decision = 'REQUEST_MORE_EVIDENCE';
  let assimilations = 0;
  let adaptations = 0;
  adapters.registerAdapter('STRATEGY', {
    validate: async ({ adaptation }) => ({ valid: true, decision: adaptation ? 'ACCEPT' : decision,
      evidence: { localTrial: 'acceptance' }, reason: 'local review' }),
    adapt: async () => { adaptations++; return { receiptId: 'adapted', provenance: { receiver: 'b' } }; },
    assimilate: async () => { assimilations++; return { receiptId: 'assimilated', provenance: { receiver: 'b' } }; }
  });
  try {
    await migration.offerPropagule({ metapopulationId: id, corridorId: corridor.corridorId, propagule: candidate }, { db });
    const review = { metapopulationId: id, migrationId: candidate.propaguleId,
      receiverDemeId: candidate.targetDemeId, receiver: { demeId: candidate.targetDemeId } };
    assert.equal((await migration.reviewPropagule(review, { db })).status, 'QUARANTINED');
    assert.equal(assimilations, 0);
    decision = 'ADAPT_AND_ACCEPT';
    assert.equal((await migration.reviewPropagule(review, { db })).status, 'ACCEPTED');
    assert.equal(adaptations, 1);
    const context = { input: { metapopulationId: id }, options: { db } };
    const action = { type: 'MIGRATE_PROPAGULE', corridorId: corridor.corridorId,
      propagule: candidate, receiver: review.receiver };
    const resumed = await migrationLoop.executeMigrationAction(action, context);
    assert.equal(resumed.resumed, true);
    assert.equal(assimilations, 1);
    await assert.rejects(() => migration.offerPropagule({ metapopulationId: id,
      corridorId: corridor.corridorId, propagule: { ...candidate, payloadRef: 'different' } }, { db }),
    { code: 'METAPOPULATION_MIGRATION_ID_CONFLICT' });
  } finally { adapters.clearAdapter('STRATEGY'); }
}

async function rescueCrashRecovery(db) {
  const id = await population(db, 'rescue_network');
  await store.updateDemeProfile(db, { metapopulationId: id, demeId: id + 'b', changes: { fitness: { score: 0.2 } } });
  const graph = await api.applyMigrationTopology(id, { db, policy: 'fully-connected' });
  const candidate = { ...propagule(id), migrationReason: 'rescue' };
  const corridor = graph.find((item) => item.sourceDemeId === candidate.sourceDemeId && item.targetDemeId === candidate.targetDemeId);
  let failAfter = true;
  let assimilations = 0;
  adapters.registerAdapter('STRATEGY', { validate: async () => ({ valid: true, evidence: { test: 'receiver' } }),
    assimilate: async () => { assimilations++; return { receiptId: 'rescue', provenance: { source: 'receiver' } }; },
    measureFitness: async ({ phase }) => {
      if (phase === 'before') return 0.2;
      if (failAfter) throw new Error('injected-measurement-outage');
      return 0.5;
    }, rollback: async () => ({ receiptId: 'rollback', provenance: { source: 'receiver' } }) });
  const action = { type: 'MIGRATE_PROPAGULE', corridorId: corridor.corridorId, propagule: candidate,
    receiver: { demeId: id + 'b' }, rescueOptions: { maxAttempts: 3, maxTargetFitness: 0.35,
      allowedRegression: 0, corridorPenalty: 0.15 } };
  const context = { input: { metapopulationId: id }, options: { db } };
  try {
    await assert.rejects(() => migrationLoop.executeMigrationAction(action, context), /injected-measurement-outage/);
    const interrupted = await migrationStore.getMigration(db, id, candidate.propaguleId);
    assert.equal(interrupted.status, 'ACCEPTED');
    assert.equal(interrupted.evidence.rescueBaseline.score, 0.2);
    assert.equal(interrupted.evidence.rescueOutcome, undefined);
    failAfter = false;
    const resumed = await migrationLoop.executeMigrationAction(action, context);
    assert.equal(resumed.status, 'ACCEPTED');
    assert.equal(resumed.rescueOutcome.finalFitness, 0.5);
    assert.equal(assimilations, 1);
  } finally { adapters.clearAdapter('STRATEGY'); }
}

async function rescueRollbackCrashRecovery(db) {
  const id = await population(db, 'rescue_network');
  await store.updateDemeProfile(db, { metapopulationId: id, demeId: id + 'b', changes: { fitness: { score: 0.2 } } });
  const graph = await api.applyMigrationTopology(id, { db, policy: 'fully-connected' });
  const candidate = { ...propagule(id), migrationReason: 'rescue' };
  const corridor = graph.find((item) => item.sourceDemeId === candidate.sourceDemeId && item.targetDemeId === candidate.targetDemeId);
  let failRestoration = true;
  let rollbacks = 0;
  adapters.registerAdapter('STRATEGY', { validate: async () => ({ valid: true, evidence: { test: 'receiver' } }),
    assimilate: async () => ({ receiptId: 'rescue', provenance: { source: 'receiver' } }),
    measureFitness: async ({ phase }) => {
      if (phase === 'before') return 0.2;
      if (phase === 'after') return 0.1;
      if (failRestoration) throw new Error('injected-restoration-outage');
      return 0.2;
    }, rollback: async () => { rollbacks++; return { receiptId: 'rollback', provenance: { source: 'receiver' } }; } });
  const action = { type: 'MIGRATE_PROPAGULE', corridorId: corridor.corridorId, propagule: candidate,
    receiver: { demeId: id + 'b' }, rescueOptions: { maxAttempts: 3, maxTargetFitness: 0.35,
      allowedRegression: 0, corridorPenalty: 0.15 } };
  const context = { input: { metapopulationId: id }, options: { db } };
  try {
    await assert.rejects(() => migrationLoop.executeMigrationAction(action, context), /injected-restoration-outage/);
    const interrupted = await migrationStore.getMigration(db, id, candidate.propaguleId);
    assert.equal(interrupted.status, 'ROLLED_BACK');
    assert.equal(interrupted.evidence.rescueAssessment.rollback, true);
    failRestoration = false;
    const resumed = await migrationLoop.executeMigrationAction({ ...action,
      rescueOptions: { ...action.rescueOptions, allowedRegression: 0.9 } }, context);
    assert.equal(resumed.rescueOutcome.rollback, true, 'persisted assessment is authoritative on resume');
    assert.equal(resumed.rescueOutcome.finalFitness, 0.2);
    assert.equal(rollbacks, 1);
  } finally { adapters.clearAdapter('STRATEGY'); }
}

async function reservePersistence(db) {
  const id = await population(db, 'rescue_network');
  const graph = await api.applyMigrationTopology(id, { db, policy: 'fully-connected' });
  const corridor = graph[0];
  await corridorStore.replaceGraph(db, id, { topology: 'rescue',
    corridors: graph.map((item) => item.corridorId === corridor.corridorId ? { ...item, enabled: false, isReserve: true } : item) });
  assert.equal((await corridorStore.listGraph(db, id)).find((item) => item.corridorId === corridor.corridorId).isReserve, true);
  const action = { type: 'ACTIVATE_RESERVE_CORRIDOR', corridorId: corridor.corridorId };
  await executors.executeVariantAction(action, { input: { metapopulationId: id }, options: { db } });
  const activated = (await corridorStore.listGraph(db, id)).find((item) => item.corridorId === corridor.corridorId);
  assert.equal(activated.enabled, true);
  assert.equal(activated.isReserve, false);
  await executors.executeVariantAction({ type: 'STAGE_FOUNDER_RESERVE', deficit: 2,
    founders: [{ lineageId: 'reserve-a' }, { lineageId: 'reserve-b' }] },
  { input: { metapopulationId: id }, options: { db } });
  const observed = await brain.observeRegion({ metapopulationId: id }, { db });
  assert.equal(observed.regionalMemory.founderReserve.length, 2);
}

async function residentLeaseRecovery(db) {
  const id = await population(db, 'persistent');
  const persistent = require('../src/services/metapopulation/runtime/persistentRuntimeService');
  const leases = require('../src/services/metapopulation/runtime/persistentDaemonLeaseService');
  const verification = require('../src/services/metapopulation/runtime/variantActionVerifiers');
  await persistent.registerResidentDaemon({ db, metapopulationId: id, demeId: id + 'a', daemonId: 'custom-resident' });
  const before = await db.get('SELECT COUNT(*) AS count FROM daemon_memory WHERE metapopulation_id = ? AND deme_id = ?', id, id + 'a');
  await db.run("UPDATE daemon_leases SET active = 0, expires_at = '2000-01-01T00:00:00.000Z' WHERE metapopulation_id = ?", id);
  const observed = await brain.observeRegion({ metapopulationId: id }, { db });
  assert.equal(observed.demes[0].isResident, false);
  assert.equal(observed.demes[0].daemonId, 'custom-resident');
  const result = await brain.runAutonomousRegionalRuntime({ metapopulationId: id }, { db });
  assert.equal(result.cycles[0].status, 'VERIFIED', JSON.stringify(result));
  const restored = await leases.loadDaemonLease(db, id, id + 'a');
  assert.equal(restored.daemonId, 'custom-resident');
  const after = await db.get('SELECT COUNT(*) AS count FROM daemon_memory WHERE metapopulation_id = ? AND deme_id = ?', id, id + 'a');
  assert.equal(after.count, before.count, 'lease recovery retains memory versions');
  const other = await leases.loadDaemonLease(db, id, id + 'b');
  const deme = await store.getDeme(db, id, id + 'a');
  const action = { type: 'REGISTER_RESIDENT_DAEMON', demeId: id + 'a', daemonId: 'custom-resident' };
  const fake = { type: action.type, demeId: action.demeId, daemonId: other.daemonId,
    leaseId: other.leaseId, workspacePath: deme.workspacePath };
  assert.equal(await verification.verifyVariantActions({ input: { metapopulationId: id }, options: { db },
    plan: { actions: [action] }, execution: { results: [fake] } }), false, 'a receipt from another deme cannot pass VERIFY');
}

async function variantMatrix(db) {
  for (const variant of Object.keys(policies.VARIANTS)) {
    const id = await population(db, variant);
    const options = { db, rustEvolution: async (request) => ({ islandName: request.islandName,
      generation: request.generation + 1, bestFitness: 0.9, meanFitness: 0.8, individuals: request.individuals }) };
    const result = await brain.runAutonomousRegionalRuntime({ metapopulationId: id, maxCycles: 1 }, options);
    assert.ok(['VERIFIED', 'NO_ACTION'].includes(result.cycles[0]?.status), variant + ': ' + JSON.stringify(result));
    if (variant === 'persistent') {
      const session = await store.loadSession(db, id);
      for (const deme of session.demes) assert.equal((await fs.stat(deme.workspacePath)).isDirectory(), true);
      const next = await brain.runAutonomousRegionalRuntime({ metapopulationId: id, resume: true }, options);
      assert.equal(next.cycles[0].status, 'VERIFIED', JSON.stringify(next));
    }
  }
}

function evidenceGuards() {
  assert.throws(() => evolution.evaluateLocalFitness({ ref: 'individual' }, {}), { code: 'METAPOPULATION_FITNESS_EVALUATOR_REQUIRED' });
  const genome = evolution.registerGenomeLineage('island', 'genome-hash', {});
  assert.throws(() => evolution.certifyGenome(genome.genomeId, { fitness: 0.9 }), { code: 'METAPOPULATION_FITNESS_EVIDENCE_INVALID' });
  assert.equal(evolution.detectSpeciation({ migrationHistoryAB: [], migrationHistoryBA: [] }).speciated, false);
}

async function run() {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  try {
    await db.exec('PRAGMA foreign_keys = ON');
    await migrateMetapopulationRuntime(db);
    evidenceGuards();
    for (const scenario of [islandPersistence, receiverDecisionsAndResume, rescueCrashRecovery, rescueRollbackCrashRecovery, reservePersistence, residentLeaseRecovery, variantMatrix]) {
      await scenario(db);
      console.log(scenario.name + ': PASS');
    }
  } finally { await db.close(); }
  console.log('Metapopulation durable execution: PASS');
}
run().catch((error) => { console.error(error); process.exitCode = 1; });
