'use strict';

const assert = require('node:assert/strict');
const evolution = require('../src/services/metapopulation/evolution/evolutionaryRuntimeService');
const sourceSink = require('../src/services/metapopulation/migration/sourceSinkRuntimeService');
const islands = require('../src/services/metapopulation/evolution/islandSearchRuntimeService');
const federated = require('../src/services/metapopulation/policy/federatedRuntimeService');
const rescue = require('../src/services/metapopulation/runtime/rescueNetworkRuntimeService');
const variantRuntime = require('../src/services/metapopulation/policy/variantRuntimeService');
const controller = require('../src/services/metapopulation/runtime/variantRegionalController');
const migrationPolicy = require('../src/services/metapopulation/migration/migrationPolicyService');

function qdArchiveChecks() {
  const archive = evolution.createQualityDiversityArchive(['novelty', 'fitness']);
  const first = evolution.qdInsert(archive, { id: 'ind-1', fitness: 0.65, descriptor: { novelty: 0.15, fitness: 0.65 } });
  assert.equal(first.inserted, true);
  assert.equal(first.displaced, false);
  const worse = evolution.qdInsert(archive, { id: 'ind-2', fitness: 0.62, descriptor: { novelty: 0.16, fitness: 0.62 } });
  assert.equal(worse.inserted, false);
  const better = evolution.qdInsert(archive, { id: 'ind-3', fitness: 0.68, descriptor: { novelty: 0.14, fitness: 0.68 } });
  assert.equal(better.inserted, true);
  assert.equal(better.displaced, true);
  const coverage = evolution.qdCoverage(archive);
  assert.equal(coverage.filled, 1);
  assert.equal(coverage.insertions, 3);
  assert.equal(coverage.displacements, 1);
  assert.ok(coverage.ratio > 0 && coverage.ratio < 1);
}

function culturalParetoChecks() {
  const candidates = [
    culturalCandidate('culture-novel', 0.9, 0.3),
    culturalCandidate('culture-fit', 0.3, 0.9),
    culturalCandidate('culture-dominated', 0.2, 0.2)
  ];
  const selected = migrationPolicy.selectCandidates(candidates, { policy: 'cultural' });
  assert.deepEqual(selected.map((item) => item.selectionFront), [1, 1, 2]);
  assert.equal(selected.length, 3);
}

function culturalCandidate(propaguleId, novelty, sourceFitness) {
  return { propaguleId, type: 'PROCEDURE', novelty, sourceFitness,
    culture: { id: propaguleId, version: 1, parentRefs: [] }, provenance: { source: 'test' } };
}

function temporalRoleChecks() {
  const demes = [
    { demeId: 'deme-src', role: 'SOURCE', status: 'ACTIVE' },
    { demeId: 'deme-sink', role: 'SINK', status: 'ACTIVE' },
    { demeId: 'deme-new', role: 'SOURCE', status: 'ACTIVE' }
  ];
  const history = [
    { demeId: 'deme-src', sourceCapacity: 0.9 },
    { demeId: 'deme-src', sourceCapacity: 0.1 },
    { demeId: 'deme-sink', sourceCapacity: 0.1 },
    { demeId: 'deme-sink', sourceCapacity: 0.85 },
    { demeId: 'deme-new', sourceCapacity: 0.9 }
  ];
  const rotation = sourceSink.reassignTemporalRoles(demes, history);
  assert.equal(rotation.rotated, 2);
  const byDeme = Object.fromEntries(rotation.changes.map((change) => [change.demeId, change.to]));
  assert.equal(byDeme['deme-src'], 'SINK');
  assert.equal(byDeme['deme-sink'], 'SOURCE');
}

function eliteMigrantChecks() {
  const state = islands.getSolverState('gap-solver', 'deme-gap', 7);
  assert.equal(islands.buildIslandEliteMigrant(state, { demeId: 'deme-other' }), null);
  islands.updateSolverState(state, { incumbentRef: 'inc-gap', lowerBound: 0, upperBound: 5, iterations: 10 });
  const elite = islands.buildIslandEliteMigrant(state, { targetDemeId: 'deme-other' });
  assert.equal(elite.migrationReason, 'elite');
  assert.equal(elite.incumbentRef, 'inc-gap');
  assert.equal(islands.buildIslandEliteMigrant(state, { targetDemeId: 'deme-gap' }), null);
  const counter = islands.buildIslandEliteMigrant(state, { targetDemeId: 'deme-other', counterexample: true, counterexampleRefs: ['ce-1'] });
  assert.equal(counter.migrationReason, 'counterexample');
  assert.deepEqual(counter.counterexampleRefs, ['ce-1']);
}

function federatedProofChecks() {
  federated.registerRegionalKey('region-a', { material: 'key-a' });
  const contract = federated.createCrossRegionContract({ sourceRegion: 'region-a', targetRegion: 'region-b',
    allowedClassifications: ['PUBLIC', 'REGIONAL'], dataMinimization: { redact: true, maxFields: 1 } });
  const planned = federated.planFederatedProofActions(
    [{ propaguleId: 'prop-g1', sourceRegion: 'region-a', targetRegion: 'region-b', fields: ['a', 'b', 'c'] }],
    [contract]);
  assert.equal(planned.length, 1);
  assert.equal(planned[0].type, 'PROOF_OF_DATA_MINIMIZATION');
  assert.ok(planned[0].proofId);
  assert.equal(planned[0].proof.minimized, true);
  const unattested = federated.planFederatedProofActions(
    [{ propaguleId: 'prop-g2', sourceRegion: 'region-a', targetRegion: 'region-nowhere', fields: ['a'] }],
    [contract]);
  assert.equal(unattested.length, 0);
}

function founderReserveChecks() {
  const full = rescue.maintainFounderReserve(
    [{ demeId: 'd1', status: 'AT_RISK' }],
    { desiredSize: 2, staged: [{ lineageId: 'l1' }, { lineageId: 'l2' }] });
  assert.equal(full.needsStaging, false);
  assert.equal(full.deficit, 0);
  const lacking = rescue.maintainFounderReserve(
    [{ demeId: 'd1', status: 'AT_RISK' }, { demeId: 'd2', status: 'ACTIVE' }],
    { desiredSize: 3, staged: [{ lineageId: 'l1' }] });
  assert.equal(lacking.needsStaging, true);
  assert.equal(lacking.deficit, 2);
  assert.equal(lacking.atRiskCount, 1);
}

async function runtimeWiringChecks() {
  await islandEliteWiring();
  await temporalRoleWiring();
  await federatedProofWiring();
  await founderReserveWiring();
}

async function islandEliteWiring() {
  const state = islands.getSolverState('wire-solver', 'deme-wire', 2);
  islands.updateSolverState(state, { incumbentRef: 'inc-wire', lowerBound: 1, upperBound: 9, iterations: 5 });
  const observed = { variant: 'island_search', variantPolicy: { eliteMigration: true }, demes: [], patches: [],
    corridors: [{ corridorId: 'corridor-wire', enabled: true, capacity: 1,
      sourceDemeId: 'deme-wire', targetDemeId: 'deme-remote' }] };
  const actions = await variantRuntime.executeVariantActions({ variant: 'island_search', observed,
    input: { islandElites: [{ solverId: 'wire-solver', demeId: 'deme-wire', generation: 2, targetDemeId: 'deme-remote', counterexample: true }],
      receiver: { agentId: 'receiver-wire' } }, options: {} });
  const elite = actions.find((action) => action.type === 'MIGRATE_PROPAGULE');
  assert.ok(elite);
  assert.equal(elite.propagule.migrationReason, 'counterexample');
}

async function temporalRoleWiring() {
  const observed = { variant: 'source_sink',
    variantPolicy: { directedMigration: true, temporalRoles: true, sourceReserveRatio: 0.2 },
    demes: [{ demeId: 'deme-t1', role: 'SOURCE', status: 'ACTIVE', capacity: 0.9 }],
    patches: [], corridors: [] };
  const input = { roleHistory: [
    { demeId: 'deme-t1', sourceCapacity: 0.9 },
    { demeId: 'deme-t1', sourceCapacity: 0.05 }
  ] };
  const actions = await variantRuntime.executeVariantActions({ variant: 'source_sink', observed, input, options: {} });
  const rotation = actions.find((action) => action.type === 'ROTATE_SOURCE_SINK_ROLES');
  assert.ok(rotation);
  assert.equal(rotation.changes[0].to, 'SINK');
}

async function federatedProofWiring() {
  federated.registerRegionalKey('region-w1', { material: 'key-w1' });
  const contract = federated.createCrossRegionContract({ sourceRegion: 'region-w1', targetRegion: 'region-w2',
    allowedClassifications: ['REGIONAL'], dataMinimization: { redact: true, maxFields: 2 } });
  const observed = { variant: 'federated',
    variantPolicy: { requireDataMinimizationProof: true, requireReceiverAttestation: true },
    demes: [], patches: [], corridors: [] };
  const input = { migrationCandidates: [
    { propaguleId: 'prop-w1', sourceRegion: 'region-w1', targetRegion: 'region-w2', fields: ['a', 'b', 'c'] }
  ], crossRegionContracts: [contract] };
  const actions = await variantRuntime.executeVariantActions({ variant: 'federated', observed, input, options: {} });
  assert.ok(actions.some((action) => action.type === 'PROOF_OF_DATA_MINIMIZATION'));
  assert.ok(actions.some((action) => action.type === 'REQUIRE_RECEIVER_ATTESTATION'));
}

async function founderReserveWiring() {
  const observed = { variant: 'rescue_network', variantPolicy: { founderReserveSize: 2 },
    demes: [{ demeId: 'deme-fr', status: 'AT_RISK' }], patches: [], corridors: [] };
  const actions = await variantRuntime.executeVariantActions({ variant: 'rescue_network', observed,
    input: { stagedFounders: [{ lineageId: 'only-one' }] }, options: {} });
  const staging = actions.find((action) => action.type === 'STAGE_FOUNDER_RESERVE');
  assert.ok(staging);
  assert.equal(staging.deficit, 1);
}

async function markerExecutionChecks() {
  const context = { input: {}, options: {}, observed: {} };
  const rotated = await controller.executeVariantAction(
    { type: 'ROTATE_SOURCE_SINK_ROLES', changes: [{ demeId: 'd', from: 'SOURCE', to: 'SINK' }] }, context);
  assert.equal(rotated.persisted, false);
  assert.equal(rotated.rotated, 0);
  const elite = await controller.executeVariantAction(
    { type: 'MIGRATE_ISLAND_ELITE', propagule: { propaguleId: 'island-elite-a-b-1' } }, context);
  assert.equal(elite.migrated, true);
  const proof = await controller.executeVariantAction(
    { type: 'PROOF_OF_DATA_MINIMIZATION', propaguleId: 'p1', proofId: 'pdm-p1-1' }, context);
  assert.equal(proof.recorded, true);
  const attestation = await controller.executeVariantAction(
    { type: 'REQUIRE_RECEIVER_ATTESTATION', propaguleId: 'p1', targetRegion: 'region-b' }, context);
  assert.equal(attestation.required, true);
  const staged = await controller.executeVariantAction(
    { type: 'STAGE_FOUNDER_RESERVE', deficit: 2 }, context);
  assert.equal(staged.staged, true);
}

async function run() {
  qdArchiveChecks();
  culturalParetoChecks();
  temporalRoleChecks();
  eliteMigrantChecks();
  federatedProofChecks();
  founderReserveChecks();
  await runtimeWiringChecks();
  await markerExecutionChecks();
  console.log('Metapopulation variant gaps: PASS');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
