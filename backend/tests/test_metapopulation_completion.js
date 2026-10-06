'use strict';

const assert = require('node:assert/strict');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const { migrateMetapopulationRuntime } = require('../src/db/migrations/migrateMetapopulationRuntime');
const metapopulation = require('../src/services/metapopulationCoordinationService');
const runtime = require('../src/services/metapopulation/runtime/regionalRuntimeService');
const brain = require('../src/services/metapopulation/runtime/regionalBrainService');
const verifiers = require('../src/services/metapopulation/runtime/variantActionVerifiers');
const policies = require('../src/services/metapopulation/runtime/regionalPolicyService');
const recovery = require('../src/services/metapopulation/demes/demeRecoveryService');
const recolonization = require('../src/services/metapopulation/patches/recolonizationService');
const adapters = require('../src/services/metapopulation/migration/migrationAdapterRegistry');
const flow = require('../src/services/metapopulation/policy/variantFlowActions');

async function population(db, variant = 'classic_patch') {
  const session = await metapopulation.createMetapopulationSession('Regional resilience acceptance.', { db, variant });
  for (const name of ['target', 'source-a', 'source-b']) {
    const suffix = session.sessionId + name;
    await metapopulation.createPatch(session.sessionId, { patchId: suffix, environment: {},
      requirements: [], resources: {}, carryingCapacity: 4, quality: 0.9, accessibility: 0.9 }, { db });
    await metapopulation.createDeme(session.sessionId, { demeId: suffix, patchId: suffix,
      fitness: { score: 0.8 }, localStrategies: [name], lineage: { founders: [name] } }, { db });
    await metapopulation.transitionDeme({ sessionId: session.sessionId, demeId: suffix, status: 'ESTABLISHING' }, { db });
    await metapopulation.transitionDeme({ sessionId: session.sessionId, demeId: suffix, status: 'ACTIVE' }, { db });
  }
  return session.sessionId;
}

function extinctEvidence() {
  return { workers: [{ status: 'CRASHED' }], localFunctions: [{ viable: false }] };
}

async function extinctionAndColonization(db) {
  const id = await population(db);
  const input = { metapopulationId: id, maxCycles: 1,
    extinctionReports: [{ demeId: id + 'target', evidence: extinctEvidence(), provenance: { source: 'worker-supervisor' } }] };
  const extinct = await brain.runAutonomousRegionalRuntime(input, { db });
  assert.equal(extinct.cycles[0].status, 'VERIFIED');
  assert.equal((await metapopulation.getDeme(id, id + 'target', { db })).status, 'COLLAPSED');
  assert.equal((await metapopulation.getPatch(id, id + 'target', { db })).status, 'VACANT');
  const observed = await brain.observeRegion({ metapopulationId: id }, { db });
  const diagnosis = brain.diagnoseRegion(observed);
  const plan = await brain.planRegionalRuntimeActions({ observed, diagnosis, input: { metapopulationId: id }, options: { db } });
  assert.ok(plan.actions.some((action) => action.type === 'START_RECOLONIZATION_TRIAL'));
  assert.equal((await db.get('SELECT COUNT(*) AS count FROM metapopulation_colonizations WHERE metapopulation_id = ?', id)).count, 0,
    'planning has no colonization side effects');
  const started = await brain.runAutonomousRegionalRuntime({ metapopulationId: id }, { db });
  assert.equal(started.cycles[0].status, 'VERIFIED', JSON.stringify(started));
  const trial = await db.get('SELECT colonization_id FROM metapopulation_colonizations WHERE metapopulation_id = ?', id);
  assert.ok(trial);
  const invalid = await brain.runAutonomousRegionalRuntime({ metapopulationId: id },
    { db, evaluateColonization: async () => ({ viable: true, fitness: null }) });
  assert.equal(invalid.status, 'HALTED');
  assert.equal((await metapopulation.getPatch(id, id + 'target', { db })).status, 'VACANT');
  const accepted = await brain.runAutonomousRegionalRuntime({ metapopulationId: id },
    { db, evaluateColonization: async () => ({ viable: true, fitness: 0.8, provenance: { evaluator: 'local-trial' } }) });
  assert.equal(accepted.cycles[0].status, 'VERIFIED');
  const row = await db.get('SELECT status, deme_id FROM metapopulation_colonizations WHERE colonization_id = ?', trial.colonization_id);
  assert.equal(row.status, 'ACCEPTED');
  assert.equal((await metapopulation.getPatch(id, id + 'target', { db })).currentDemeId, row.deme_id);
  assert.ok((await metapopulation.listMetapopulationEvents(id, { db })).some((event) => event.type === 'RECOLONIZATION_COMPLETED'));
  await brain.runAutonomousRegionalRuntime({ metapopulationId: id }, { db });
  assert.equal((await metapopulation.getPatch(id, id + 'target', { db })).currentDemeId, row.deme_id,
    'historical collapsed demes cannot vacate a recolonized patch');
}

async function failedFoundersStayPatchLocal(db) {
  const id = await population(db);
  const vacant = id + 'vacant';
  const other = id + 'other';
  for (const patchId of [vacant, other]) await metapopulation.createPatch(id, { patchId, environment: {},
    requirements: [], resources: {}, carryingCapacity: 2, quality: 0.8, accessibility: 0.8 }, { db });
  const trial = await recolonization.startColonizationTrial({ metapopulationId: id, patchId: vacant,
    founders: [{ lineageId: 'bad-a' }, { lineageId: 'bad-b' }] }, { db });
  await recolonization.finishColonizationTrial({ metapopulationId: id, colonizationId: trial.colonizationId,
    evidence: { viable: false, fitness: 0.1, provenance: { evaluator: 'local-failure' } } }, { db });
  const plan = await recolonization.planRecolonization({ metapopulationId: id,
    candidateLineages: ['bad-a', 'bad-b', 'good-a', 'good-b'].map((lineageId) => ({ lineageId })) }, { db });
  assert.deepEqual(plan.patches.find((patch) => patch.patchId === vacant).founders.map((item) => item.lineageId), ['good-a', 'good-b']);
  assert.equal(plan.patches.find((patch) => patch.patchId === other).founders.length, 4);
}

function probeAdapters() {
  return { observe: async () => ({}), diagnose: async () => ({}),
    plan: async () => ({ actions: [{ type: 'PROBE' }] }),
    execute: async () => ({ completed: true }), verify: async () => ({ valid: true }) };
}

async function runtimeRecoveryAndStops(db) {
  const session = await metapopulation.createMetapopulationSession('Resume bounded cycles.', { db });
  const input = { metapopulationId: session.sessionId, maxCycles: 2 };
  await runtime.runRegionalRuntime(input, { db, adapters: probeAdapters() });
  const resume = { metapopulationId: session.sessionId, resume: true, maxCycles: 1 };
  const next = await runtime.runRegionalRuntime(resume, { db, adapters: probeAdapters() });
  assert.equal(next.cycles.length, 1);
  assert.equal(next.cycles[0].cycle, 3);
  assert.equal(resume.seed, undefined, 'caller input is not mutated');
  await db.run("UPDATE metapopulation_sessions SET status = 'CLOSED' WHERE id = ?", session.sessionId);
  const stopped = await runtime.runRegionalRuntime(input, { db, adapters: probeAdapters() });
  assert.equal(stopped.reason, 'SESSION_INACTIVE');
}

async function journalIsAtomic(db) {
  const session = await metapopulation.createMetapopulationSession('Atomic verified journal.', { db });
  await db.exec("CREATE TEMP TRIGGER fail_cycle_state BEFORE INSERT ON metapopulation_cycle_states BEGIN SELECT RAISE(ABORT, 'injected-state-failure'); END;");
  const outcome = await runtime.runRegionalRuntime({ metapopulationId: session.sessionId }, { db, adapters: probeAdapters() });
  await db.exec('DROP TRIGGER fail_cycle_state');
  assert.equal(outcome.status, 'HALTED');
  const events = await metapopulation.listMetapopulationEvents(session.sessionId, { db });
  assert.equal(events.filter((event) => event.type === 'REGIONAL_CYCLE_RECORDED').length, 0);
  assert.equal(events.filter((event) => event.type === 'REGIONAL_CYCLE_FAILED').length, 1);
}

async function trialVerificationIsAwaited(db) {
  const id = await population(db);
  const context = { input: { metapopulationId: id }, options: { db },
    plan: { actions: [{ type: 'START_RECOLONIZATION_TRIAL', patchId: 'missing', founders: [] }] },
    execution: { results: [{ type: 'START_RECOLONIZATION_TRIAL', colonizationId: 'invented' }] } };
  assert.equal(await verifiers.verifyVariantActions(context), false, 'an unresolved Promise cannot pass the gate');
}

async function durablePolicies(db) {
  const id = await population(db, 'anti_synchrony');
  const action = { type: 'PROTECT_FROM_EXTINCTION', demeId: id + 'target', uniqueCapabilities: ['target'] };
  const context = { input: { metapopulationId: id }, options: { db } };
  const item = await policies.executePolicyAction(action, context);
  assert.equal(await policies.verifyPolicyAction({ item, expected: action, db, metapopulationId: id }), true);
  const observed = await brain.observeRegion({ metapopulationId: id }, { db });
  assert.equal(observed.demes.find((deme) => deme.demeId === action.demeId).protectedFromCull, true);
  assert.equal(await policies.verifyPolicyAction({ item: { ...item, eventRevision: 1 }, expected: action, db, metapopulationId: id }), false);
}

async function migrationGate(db) {
  const id = await population(db, 'heterogeneous_islands');
  await metapopulation.applyMigrationTopology(id, { db, policy: 'fully-connected' });
  const observed = await brain.observeRegion({ metapopulationId: id }, { db });
  const candidate = { propaguleId: id + 'migrant', type: 'STRATEGY', sourceDemeId: id + 'source-a',
    targetDemeId: id + 'source-b', payloadRef: 'strategy', migrationReason: 'novelty', lineageRefs: [],
    sourceEvidence: ['local-test'], provenance: { source: 'local-test' }, sourceFitness: 0.8, novelty: 0.8 };
  const input = { receiver: { demeId: candidate.targetDemeId } };
  assert.equal(flow.routableMigrationAction({ candidate, observed, input }), null);
  adapters.registerAdapter('STRATEGY', { validate: async () => ({ valid: true }),
    assimilate: async () => ({ receiptId: 'trial', provenance: { source: 'receiver' } }) });
  try {
    assert.equal(flow.routableMigrationAction({ candidate, observed, input }), null, 'utility must be demonstrated');
    const useful = { ...candidate, expectedReceiverGain: 0.3 };
    assert.ok(flow.routableMigrationAction({ candidate: useful, observed, input }));
    assert.equal(flow.routableMigrationAction({ candidate: useful, observed, input: { ...input, enableMigration: false } }), null);
  } finally { adapters.clearAdapter('STRATEGY'); }
}

function extinctionEvidenceChecks() {
  assert.equal(recovery.assessExtinction({ workers: [{ status: 'BUSY' }], localFunctions: [] }).status, 'UNKNOWN');
  assert.equal(recovery.assessExtinction({ workers: [{ status: 'CRASHED' }] }).status, 'UNKNOWN');
  assert.equal(recovery.assessExtinction({ workers: [{ status: 'CRASHED' }], localFunctions: [{ viable: true }] }).status, 'NOT_EXTINCT');
  assert.equal(recovery.assessExtinction(extinctEvidence()).status, 'EXTINCT');
}

async function run() {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  try {
    await db.exec('PRAGMA foreign_keys = ON');
    await migrateMetapopulationRuntime(db);
    extinctionEvidenceChecks();
    await extinctionAndColonization(db);
    await failedFoundersStayPatchLocal(db);
    await runtimeRecoveryAndStops(db);
    await journalIsAtomic(db);
    await trialVerificationIsAwaited(db);
    await durablePolicies(db);
    await migrationGate(db);
  } finally { await db.close(); }
  console.log('Metapopulation completion: PASS');
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
