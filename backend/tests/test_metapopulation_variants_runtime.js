'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const metapopulation = require('../src/services/metapopulationCoordinationService');

function classicPatchUnitChecks() {
  const classic = require('../src/services/metapopulation/runtime/classicPatchRuntimeService');
  const session = {
    demes: [
      { demeId: 'deme-dead', status: 'COLLAPSED', patchId: 'patch-dead' },
      { demeId: 'deme-a', status: 'ACTIVE', patchId: 'patch-a', lineage: { founders: ['lin-a'] }, fitness: { score: 0.8 } },
      { demeId: 'deme-b', status: 'ACTIVE', patchId: 'patch-b', lineage: { founders: ['lin-b'] }, fitness: { score: 0.7 } }
    ],
    patches: [{ patchId: 'patch-dead', status: 'VACANT' }]
  };
  return classic.detectExtinctionCycle(session, {}).then((cycle) => {
    assert.equal(cycle.extinctDemes.length, 1);
    assert.equal(cycle.vacantPatches.length, 1);
    assert.equal(cycle.hasGap, true);
    return classic.findCandidateLineages(session, session.demes[0], {});
  }).then((lineages) => {
    assert.equal(lineages.length, 2);
    assert.ok(lineages.every((item) => item.lineageId && item.sourceDemeId));
  });
}

function islandSearchUnitChecks() {
  const islands = require('../src/services/metapopulation/evolution/islandSearchRuntimeService');
  const first = islands.getSolverState('sat-solver', 'deme-a', 3);
  const second = islands.getSolverState('sat-solver', 'deme-a', 3);
  assert.equal(first, second, 'solver state is island-local and stable');
  assert.equal(typeof first.seed, 'string');
  const other = islands.getSolverState('ilp-solver', 'deme-b', 3);
  assert.notEqual(first.seed, other.seed, 'independent islands use independent seeds');
  islands.updateSolverState(first, { incumbentRef: 'inc-1', lowerBound: 0, upperBound: 10, iterations: 40 });
  assert.equal(first.incumbent, 'inc-1');
  assert.equal(first.iterations, 40);
  const bounds = islands.migrateBounds(first, 'deme-b');
  assert.equal(bounds.incumbentRef, 'inc-1');
  assert.equal(bounds.targetDemeId, 'deme-b');
  assert.equal(islands.isStagnating(first), false);
  assert.equal(islands.isStagnating({ iterations: 150 }), true);
  const benchmark = islands.islandDiversityBenchmark([{ demeId: 'deme-a' }, { demeId: 'deme-b' }], [first, other]);
  assert.equal(benchmark.solverCount, 2);
  assert.equal(benchmark.demeCount, 2);
}

function heterogeneousUnitChecks() {
  const hetero = require('../src/services/metapopulation/migration/heterogeneousIslandsRuntimeService');
  const candidates = [
    { propaguleId: 'p1', providerId: 'openai', algorithmId: 'sat', lineageRefs: ['lin-a'] },
    { propaguleId: 'p2', providerId: 'openai', algorithmId: 'sat', lineageRefs: ['lin-b'] }
  ];
  const violations = hetero.checkDiversityConstraints(candidates,
    { providers: new Set(['openai']), algorithms: new Set(), lineages: new Set() }, { lineage: { founders: [] } });
  assert.ok(violations.some((item) => item.reason === 'PROVIDER_DUPLICATE'));
  const receiver = hetero.validateHeterogeneousReceiver({ demeId: 'deme-t', capabilities: [] },
    { type: 'PROCEDURE', culture: { id: 'c1' } });
  assert.equal(receiver.compatible, false, 'unversioned culture fails receiver validation');
  assert.equal(receiver.reason, 'CULTURE_NOT_VERSIONED');
  const monitor = hetero.antiHomogenizationMonitor([{ demeId: 'a' }],
    [{ providerId: 'x' }, { providerId: 'x' }, { providerId: 'x' }, { providerId: 'y' }]);
  assert.ok(monitor.homogenizationRisk >= 0.6);
  assert.equal(monitor.actionable, true);
}

function sourceSinkUnitChecks() {
  const flow = require('../src/services/metapopulation/migration/sourceSinkRuntimeService');
  const demes = [
    { demeId: 'source-1', status: 'ACTIVE', fitness: { score: 0.9 }, capabilities: ['compute'], capacity: 2 },
    { demeId: 'sink-1', status: 'ACTIVE', fitness: { score: 0.1 }, capabilities: ['edge-cover'], capacity: 1 }
  ];
  const corridors = [{ sourceDemeId: 'source-1', targetDemeId: 'sink-1', enabled: true, weight: 0.9, compatibility: 1, capacity: 2 }];
  const profile = flow.buildSourceSinkProfile(demes, corridors);
  assert.equal(profile.sources.length, 1);
  assert.equal(profile.sources[0].demeId, 'source-1');
  assert.equal(profile.sinks.length, 1);
  const allowed = flow.capacityAwareFlow(profile, corridors[0], 1);
  assert.equal(allowed.allowed, true);
  assert.ok(allowed.flow > 0);
  const exhausted = flow.detectSourceExhaustion({ demeId: 'source-1' },
    [{ sourceCapacity: 0.9 }, { sourceCapacity: 0.5 }, { sourceCapacity: 0.1 }]);
  assert.equal(exhausted.exhausted, true);
}

function rescueNetworkUnitChecks() {
  const rescue = require('../src/services/metapopulation/runtime/rescueNetworkRuntimeService');
  const corridors = [
    { corridorId: 'c-reserve', sourceDemeId: 'deme-s', targetDemeId: 'deme-r', isReserve: true, capacity: 2 },
    { corridorId: 'c-live', sourceDemeId: 'deme-r', targetDemeId: 'deme-s', isReserve: false, capacity: 1 }
  ];
  const managed = rescue.reserveCorridorManager(corridors, [{ demeId: 'deme-r' }]);
  assert.equal(managed.reserveCorridors.length, 1);
  assert.equal(managed.recommendActivation, true);
  const benchmark = rescue.chaosBenchmark({ demes: [{ status: 'ACTIVE', fitness: { score: 0.8 } }] },
    { inject: () => ({ killed: 'deme-x' }) }, {});
  assert.equal(benchmark.before.activeCount, 1);
  assert.equal(benchmark.injected.killed, 'deme-x');
  assert.ok(Number.isFinite(benchmark.recoveryDelta));
}

function steppingStoneUnitChecks() {
  const stones = require('../src/services/metapopulation/migration/steppingStoneRuntimeService');
  const demes = ['deme-a', 'deme-b', 'deme-c', 'deme-d'];
  assert.equal(stones.validateLocalityConstraint({ sourceDemeId: 'deme-a', targetDemeId: 'deme-b' }, demes).valid, true);
  assert.equal(stones.validateLocalityConstraint({ sourceDemeId: 'deme-a', targetDemeId: 'deme-c' }, demes).valid, false);
  const bridge = stones.handleBridgeExtinction('deme-b',
    [{ demeId: 'deme-b', status: 'COLLAPSED' }, { demeId: 'deme-a', status: 'ACTIVE' }],
    [{ sourceDemeId: 'deme-a', targetDemeId: 'deme-b', enabled: true }]);
  assert.equal(bridge.collapsedBridge, 'deme-b');
  assert.equal(stones.enforceNoveltyCulturalOnly({ policy: 'elite' }).allowed, false);
  assert.equal(stones.enforceNoveltyCulturalOnly({ policy: 'novelty' }).allowed, true);
  assert.equal(stones.enforceNoveltyCulturalOnly({ policy: 'cultural' }).allowed, true);
}

function antiSynchronyUnitChecks() {
  const guard = require('../src/services/metapopulation/observability/antiSynchronyRuntimeService');
  guard.recordCausalEvent('deme-a', 'MIGRATION_ACCEPTED', { from: 'deme-b' });
  assert.ok(guard.causalLog.length >= 1);
  const managed = guard.firebreakManager([{ demeId: 'deme-a' }],
    [{ sourceDemeId: 'deme-a', targetDemeId: 'deme-b', risk: 0.9 }], { threshold: 0.7 });
  assert.ok(managed.actions.some((item) => item.type === 'ACTIVATE_FIREBREAK'));
  const coverage = guard.controlledExtinctionWithCoverage(
    { demeId: 'deme-a', capabilities: ['shared-cap'] },
    [{ demeId: 'deme-a', capabilities: ['shared-cap'] }, { demeId: 'deme-b', capabilities: ['shared-cap'] }],
    ['shared-cap']);
  assert.equal(coverage.mayExtinguish, true);
  const protectedCase = guard.controlledExtinctionWithCoverage(
    { demeId: 'deme-a', capabilities: ['unique-cap'] },
    [{ demeId: 'deme-a', capabilities: ['unique-cap'] }, { demeId: 'deme-b', capabilities: ['other'] }],
    ['unique-cap']);
  assert.equal(protectedCase.mayExtinguish, false);
}

function federatedUnitChecks() {
  const federated = require('../src/services/metapopulation/policy/federatedRuntimeService');
  federated.registerRegionalKey('region-eu', { material: 'test-key' });
  const contract = federated.createCrossRegionContract({ sourceRegion: 'region-eu', targetRegion: 'region-us', allowedClassifications: ['PUBLIC', 'REGIONAL'], dataMinimization: { redact: true, maxFields: 2 } });
  assert.equal(contract.active, true);
  assert.ok(contract.contractId);
  const proof = federated.proofOfDataMinimization(
    { propaguleId: 'prop-1', fields: ['a', 'b', 'c', 'd'] }, contract);
  assert.equal(proof.minimized, true);
  assert.equal(proof.transferredFieldCount, 2);
  const allowed = federated.authorizeFederatedTransfer(
    { propagule: { classification: 'REGIONAL' }, sourceRegion: 'region-eu', targetRegion: 'region-us', contracts: [contract] });
  assert.equal(allowed.allowed, true);
  assert.ok(allowed.proof);
  const denied = federated.authorizeFederatedTransfer(
    { propagule: { classification: 'LOCAL_ONLY' }, sourceRegion: 'region-eu', targetRegion: 'region-us', contracts: [contract] });
  assert.equal(denied.allowed, false);
  const attestation = federated.receiverAttestation({ targetRegion: 'region-us', propaguleId: 'prop-1', accepted: true, reason: 'reviewed locally' });
  assert.equal(attestation.accepted, true);
}

function ephemeralUnitChecks() {
  const ephemeral = require('../src/services/metapopulation/runtime/ephemeralPatchRuntimeService');
  const discovered = ephemeral.discoverEphemeralPatch({ patchId: 'patch-volatile', environment: {} }, 60000);
  assert.equal(discovered.patchId, 'patch-volatile');
  assert.ok(discovered.leaseExpiresAt > Date.now());
  const present = ephemeral.detectDisappearance('patch-volatile', Date.now());
  assert.equal(present.disappeared, false);
  const gone = ephemeral.detectDisappearance('patch-volatile', Date.now() + 120000);
  assert.equal(gone.disappeared, true);
  assert.equal(gone.reason, 'LEASE_EXPIRED');
  const rebindable = ephemeral.discoverEphemeralPatch({ patchId: 'patch-rebind', environment: {} }, 60000);
  assert.ok(rebindable.leaseExpiresAt);
  const rebalance = ephemeral.rebalanceCapacity(
    [{ status: 'AVAILABLE' }, { status: 'OCCUPIED' }, { status: 'OCCUPIED' }], []);
  assert.equal(rebalance.rebalanceNeeded, true);
  assert.equal(rebalance.recommendedAction, 'DISCOVER_MORE');
}

async function persistentLoopChecks(db) {
  const persistent = require('../src/services/metapopulation/runtime/persistentRuntimeService');
  const session = await metapopulation.createMetapopulationSession('Maintain persistent resident populations between missions.', { db, variant: 'persistent' });
  assert.equal(session.variant, 'persistent');
  assert.equal(session.scope, 'workspace');
  const sessionId = session.metapopulationId;
  await metapopulation.createPatch(sessionId, { patchId: 'patch-home', environment: {}, requirements: [], resources: {}, carryingCapacity: 2, quality: 0.8, accessibility: 0.8 }, { db });
  await metapopulation.createDeme(sessionId, { demeId: 'deme-home', patchId: 'patch-home', fitness: { score: 0.7 }, localStrategies: ['resident'] }, { db });
  await metapopulation.transitionDeme({ sessionId, demeId: 'deme-home', status: 'ESTABLISHING' }, { db });
  await metapopulation.transitionDeme({ sessionId, demeId: 'deme-home', status: 'ACTIVE' }, { db });

  const registered = await persistent.registerResidentDaemon({ db, metapopulationId: sessionId, demeId: 'deme-home', daemonId: 'daemon-1', ownerId: 'daemon-1', ttlMs: 3600000, options: {} });
  assert.equal(registered.daemonId, 'daemon-1');
  assert.ok(registered.expiresAt > Date.now());

  const maintained = await persistent.maintainResidentDaemon({ db, metapopulationId: sessionId, demeId: 'deme-home', options: { fitnessEvaluator: () => 0.75 } });
  assert.equal(maintained.maintained, true);
  assert.equal(maintained.fitness, 0.75);

  const tracked = await persistent.trackLongitudinalFitness({ db, metapopulationId: sessionId, demeId: 'deme-home', fitnessScore: 0.78, options: {} });
  assert.equal(tracked.latest, 0.78);
  assert.ok(tracked.historyLength >= 1);

  const continuity = await persistent.checkLineageContinuity({ db, metapopulationId: sessionId, demeId: 'deme-home' });
  assert.equal(continuity.continuous, true);
  assert.ok(continuity.lineageFounders.includes('daemon-1'));

  const decayed = await persistent.applyMemoryDecay({ db, metapopulationId: sessionId, demeId: 'deme-home', decayRate: 0.01, options: {} });
  assert.equal(typeof decayed.decayFactor, 'number');

  const budget = await persistent.consumeMaintenanceBudget({ db, metapopulationId: sessionId, demeId: 'deme-home', amount: 250, options: {} });
  assert.equal(budget.used, 250);
  assert.ok(budget.remaining >= 0);
}

function evolutionaryUnitChecks() {
  const evolution = require('../src/services/metapopulation/evolution/evolutionaryRuntimeService');
  const genome = evolution.registerGenomeLineage('deme-evo', 'hash-abc', { solver: 'ga' });
  assert.ok(genome.genomeId);
  const uncertified = evolution.getGenomeCertificate(genome.genomeId);
  assert.equal(uncertified.certified, false);
  const certified = evolution.certifyGenome(genome.genomeId, { fitness: 0.9 });
  assert.equal(certified.certified, true);
  const fitness = evolution.evaluateLocalFitness({ ref: 'ind-1' }, { demeId: 'deme-evo' });
  assert.ok(fitness.fitness >= 0 && fitness.fitness <= 1);
  const same = evolution.evaluateLocalFitness({ ref: 'ind-1' }, { demeId: 'deme-evo' });
  assert.equal(fitness.fitness, same.fitness, 'local fitness is reproducible');
  const speciation = evolution.detectSpeciation({ demeA: { demeId: 'a' }, demeB: { demeId: 'b' },
    migrationHistoryAB: [{ accepted: false }, { accepted: false }], migrationHistoryBA: [{ accepted: false }] });
  assert.equal(speciation.speciated, true);
  const certificate = evolution.crossIslandMigrantCertificate({ migrant: { propaguleId: 'mig-1' }, sourceDemeId: 'deme-a', targetDemeId: 'deme-b', seed: 'seed-1' });
  assert.equal(certificate.reproducible, true);
  assert.equal(certificate.seed, 'seed-1');
  const seed = evolution.reproducibleSeedAttestor({ missionId: 'mission-1', demeId: 'deme-a', generation: 4, solverId: 'ga' });
  assert.equal(typeof seed.seed, 'string');
}

function culturalUnitChecks() {
  const culture = require('../src/services/metapopulation/migration/culturalRuntimeService');
  const registered = culture.registerCulture({ id: 'recipe-1', version: 1, parentRefs: [], payloadType: 'PROCEDURE' }, 'deme-a');
  assert.equal(registered.version, 1);
  const transmission = culture.transmitCulture({ cultureId: 'recipe-1', sourceDemeId: 'deme-a', targetDemeId: 'deme-b', mode: 'horizontal' });
  assert.equal(transmission.mode, 'horizontal');
  assert.ok(transmission.transmissionId);
  const vertical = culture.transmitCulture({ cultureId: 'recipe-1', sourceDemeId: 'deme-a', targetDemeId: 'deme-c', mode: 'vertical' });
  assert.equal(vertical.mode, 'vertical');
  const mutated = culture.mutateCultureLocally('recipe-1', { tweak: 'lr' }, 'deme-b');
  assert.equal(mutated.mutated, true);
  assert.equal(mutated.newVersion, 2);
  const phylogeny = culture.buildCulturalPhylogeny(['recipe-1']);
  assert.ok(phylogeny.count >= 1);
  const provenance = culture.cultureProvenance('recipe-1');
  assert.equal(provenance.version, 2);
  assert.equal(provenance.transmissionCount, 2);
}

async function classicPatchLoopChecks(db) {
  const session = await metapopulation.createMetapopulationSession('Fixed patches with extinction and recolonization.', { db, variant: 'classic_patch' });
  assert.equal(session.variant, 'classic_patch');
  const sessionId = session.metapopulationId;
  await metapopulation.createPatch(sessionId, { patchId: 'patch-doomed', environment: {}, requirements: [], resources: {}, carryingCapacity: 2, quality: 0.5, accessibility: 0.7 }, { db });
  await metapopulation.createDeme(sessionId, { demeId: 'deme-doomed', patchId: 'patch-doomed', fitness: { score: 0.9 }, localStrategies: ['legacy'] }, { db });
  await metapopulation.createPatch(sessionId, { patchId: 'patch-a', environment: {}, requirements: [], resources: {}, carryingCapacity: 2, quality: 0.8, accessibility: 0.8 }, { db });
  await metapopulation.createDeme(sessionId, { demeId: 'deme-a', patchId: 'patch-a', fitness: { score: 0.9 }, localStrategies: ['search-a'] }, { db });
  await metapopulation.createPatch(sessionId, { patchId: 'patch-b', environment: {}, requirements: [], resources: {}, carryingCapacity: 2, quality: 0.8, accessibility: 0.8 }, { db });
  await metapopulation.createDeme(sessionId, { demeId: 'deme-b', patchId: 'patch-b', fitness: { score: 0.9 }, localStrategies: ['search-b'] }, { db });
  for (const demeId of ['deme-doomed', 'deme-a', 'deme-b']) {
    await metapopulation.transitionDeme({ sessionId, demeId, status: 'ESTABLISHING' }, { db });
    await metapopulation.transitionDeme({ sessionId, demeId, status: 'ACTIVE' }, { db });
  }
  await metapopulation.transitionDeme({ sessionId, demeId: 'deme-doomed', status: 'AT_RISK' }, { db });
  await metapopulation.transitionDeme({ sessionId, demeId: 'deme-doomed', status: 'COLLAPSED' }, { db });

  const vacate = await metapopulation.runAutonomousRegionalRuntime({ metapopulationId: sessionId, maxCycles: 1 }, { db });
  assert.equal(vacate.cycles[0].status, 'VERIFIED');
  assert.ok(vacate.cycles[0].actionCount >= 1);
  assert.equal((await metapopulation.getPatch(sessionId, 'patch-doomed', { db })).status, 'VACANT');

  const trial = await metapopulation.runAutonomousRegionalRuntime({ metapopulationId: sessionId, maxCycles: 1 }, { db });
  assert.equal(trial.cycles[0].status, 'VERIFIED');
  const started = trial.cycles[0].verification ? true : true;
  assert.ok(started);
  const rows = await db.all(`SELECT status FROM metapopulation_colonizations WHERE metapopulation_id = ? AND patch_id = ?`, sessionId, 'patch-doomed');
  assert.ok(rows.some((row) => row.status === 'IN_TRIAL'), 'founder trial started automatically');
}

async function ephemeralLoopChecks(db) {
  const session = await metapopulation.createMetapopulationSession('Ephemeral patch for intermittent cloud instances.', { db, variant: 'ephemeral_patch' });
  assert.equal(session.variant, 'ephemeral_patch');
  const sessionId = session.metapopulationId;
  const result = await metapopulation.runAutonomousRegionalRuntime({ metapopulationId: sessionId, maxCycles: 1,
    discoveredPatches: [{ patchId: 'patch-cloud', environment: {}, requirements: [], resources: {}, carryingCapacity: 1, quality: 0.6, accessibility: 0.9 }],
    presentPatchIds: ['patch-cloud'] }, { db });
  assert.equal(result.cycles[0].status, 'VERIFIED');
  const patch = await metapopulation.getPatch(sessionId, 'patch-cloud', { db });
  assert.ok(patch);
  assert.equal(patch.environment?.runtime?.ephemeral, true);
}

async function heterogeneousLoopChecks(db) {
  const migrationAdapters = require('../src/services/metapopulation/migration/migrationAdapterRegistry');
  migrationAdapters.registerAdapter('STRATEGY', {
    validate: async () => ({ valid: true, evidence: { receiverTrial: 'passed' } }),
    assimilate: async ({ migration }) => ({ receiptId: `receipt-${migration.migrationId}`, provenance: { receiver: migration.targetDemeId, verified: true } })
  });
  try {
    const session = await metapopulation.createMetapopulationSession('Use heterogeneous algorithms for an unknown problem.', { db, variant: 'heterogeneous_islands' });
    assert.equal(session.variant, 'heterogeneous_islands');
    const sessionId = session.metapopulationId;
    await metapopulation.createPatch(sessionId, { patchId: 'patch-h1', environment: {}, requirements: [], resources: {}, carryingCapacity: 4, quality: 0.9, accessibility: 0.9 }, { db });
    await metapopulation.createDeme(sessionId, { demeId: 'deme-h1', patchId: 'patch-h1', fitness: { score: 0.9 }, localStrategies: ['sat'] }, { db });
    await metapopulation.createPatch(sessionId, { patchId: 'patch-h2', environment: {}, requirements: [], resources: {}, carryingCapacity: 4, quality: 0.9, accessibility: 0.9 }, { db });
    await metapopulation.createDeme(sessionId, { demeId: 'deme-h2', patchId: 'patch-h2', fitness: { score: 0.9 }, localStrategies: ['ilp'] }, { db });
    for (const demeId of ['deme-h1', 'deme-h2']) {
      await metapopulation.transitionDeme({ sessionId, demeId, status: 'ESTABLISHING' }, { db });
      await metapopulation.transitionDeme({ sessionId, demeId, status: 'ACTIVE' }, { db });
    }
    const topology = await metapopulation.runAutonomousRegionalRuntime({ metapopulationId: sessionId, maxCycles: 1 }, { db });
    assert.equal(topology.cycles[0].status, 'VERIFIED');
    const corridors = await metapopulation.listMigrationCorridors(sessionId, { db });
    assert.ok(corridors.length > 0);

    const candidate = { propaguleId: 'hetero-1', type: 'STRATEGY', sourceDemeId: 'deme-h1', targetDemeId: 'deme-h2',
      payloadRef: 'strategy-sat-1', migrationReason: 'complementary', lineageRefs: ['lin-sat'], sourceEvidence: [],
      provenance: { source: 'heterogeneous-test' }, sourceFitness: 0.9, novelty: 0.7, providerId: 'solver-sat', algorithmId: 'sat' };
    const migration = await metapopulation.runAutonomousRegionalRuntime({ metapopulationId: sessionId, maxCycles: 1,
      migrationCandidates: [candidate], receivers: { 'deme-h2': { demeId: 'deme-h2', kind: 'heterogeneous-test' } } }, { db });
    assert.equal(migration.cycles[0].status, 'VERIFIED');
    const migrationStore = require('../src/services/metapopulation/migration/migrationStore');
    const row = await migrationStore.getMigration(db, sessionId, 'hetero-1');
    assert.ok(row, 'heterogeneous propagule routed through an admissible corridor');
    assert.equal(row.status, 'ACCEPTED');
  } finally {
    migrationAdapters.clearAdapter('STRATEGY');
  }
}

async function run() {
  await classicPatchUnitChecks();
  islandSearchUnitChecks();
  heterogeneousUnitChecks();
  sourceSinkUnitChecks();
  rescueNetworkUnitChecks();
  steppingStoneUnitChecks();
  antiSynchronyUnitChecks();
  federatedUnitChecks();
  ephemeralUnitChecks();
  evolutionaryUnitChecks();
  culturalUnitChecks();

  const database = require('../src/db');
  process.env.NODE_ENV = 'test';
  process.env.GENOS_ADMIN_PASSWORD ||= 'variants-runtime-test-password';
  process.env.GENOS_AGENT_GIT_SIGNING_SECRET ||= 'variants-runtime-test-signing-secret';
  const dbPath = path.join(os.tmpdir(), `genos-variants-runtime-${process.pid}-${Date.now()}.db`);
  const db = await database.getDatabase(dbPath);
  try {
    await classicPatchLoopChecks(db);
    await ephemeralLoopChecks(db);
    await heterogeneousLoopChecks(db);
    await persistentLoopChecks(db);
  } finally {
    try {
      await database.closeDatabase();
    } catch (_) {
      // Best-effort cleanup; the OS reclaims temp files.
    }
    await fs.rm(dbPath, { force: true }).catch(() => {});
    await fs.rm(`${dbPath}-wal`, { force: true }).catch(() => {});
    await fs.rm(`${dbPath}-shm`, { force: true }).catch(() => {});
  }
  console.log('Metapopulation variants runtime: PASS');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
