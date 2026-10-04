'use strict';

const assert = require('node:assert/strict');
const metapopulation = require('../src/services/metapopulationCoordinationService');
const policyService = require('../src/services/metapopulation/policy/metapopulationPolicyService');

async function run() {
  assertSelection('A regional outage needs recovery and rescue.', 'resilient', 'rescue');
  assertSelection('Audit the security incident and recover from the outage.', 'conservative', 'counterexample');
  assertSelection('Explore unknown hypotheses and discover novel options.', 'exploratory', 'novelty');
  assertSelection('Perform a security audit and verify compliance.', 'conservative', 'counterexample');
  assertSelection('Partition this mission across independent populations.', 'balanced', 'complementary');
  assertSelection('Three independent populations use different algorithms and may transfer validated ideas.', 'heterogeneous_islands', 'complementary');
  assertSelection('Three different local environments retain local solutions and transfer only successful techniques.', 'heterogeneous_islands', 'complementary');
  assertSelection('Trois populations indépendantes utilisent chacune une philosophie différente : gloutonne, dynamique et recherche locale.', 'heterogeneous_islands', 'complementary');
  assertSelection('Quatre populations optimisent chacune une dimension différente et ne migrent que des techniques validées localement.', 'heterogeneous_islands', 'complementary');
  assert.equal(metapopulation.composeMetapopulation('Explore after an outage.', { variant: 'balanced' }).variant, 'balanced');
  verifyDocumentedVariants();
  verifyTopologyEffects();
  assert.throws(() => metapopulation.composeMetapopulation('Recover.', { variant: 'unknown' }),
    (error) => error.code === 'METAPOPULATION_VARIANT_UNKNOWN');
  verifyPolicyEffects();
  await verifySessionPersistence();
  console.log('Metapopulation automatic variant selection: PASS');
}

function verifyDocumentedVariants() {
  for (const variant of policyService.DOCUMENTED_VARIANTS) {
    const composition = metapopulation.composeMetapopulation('Explicitly configure this population.', { variantId: variant });
    assert.equal(composition.variant, variant);
    assert.equal(composition.variantSelection.method, 'explicit');
    assert.ok(composition.variantPolicy.migration);
  }
  assertSelection('Use federated data sovereignty and local-only populations.', 'federated', 'cultural');
  assertSelection('Deploy an ephemeral patch for intermittent cloud instances.', 'ephemeral_patch', 'elite');
  assertSelection('Maintain persistent resident populations between missions.', 'persistent', 'cultural');
  const missionCases = [
    ['Fixed patches with extinction and recolonization.', 'classic_patch'],
    ['SAT island search using local search.', 'island_search'],
    ['Use heterogeneous algorithms for an unknown problem.', 'heterogeneous_islands'],
    ['Resolve source sink resource imbalance.', 'source_sink'],
    ['Rescue network for critical functions.', 'rescue_network'],
    ['Use stepping stone sparse migration.', 'stepping_stone'],
    ['Prevent anti synchrony and correlated failure with a firebreak.', 'anti_synchrony'],
    ['Federated data sovereignty with local only populations.', 'federated'],
    ['Ephemeral patch for intermittent cloud instances.', 'ephemeral_patch'],
    ['Persistent resident populations between missions.', 'persistent'],
    ['Evolutionary genome mutation cycle.', 'evolutionary'],
    ['Cultural artifacts and procedures migrate.', 'cultural']
  ];
  for (const [mission, expected] of missionCases) {
    assert.equal(metapopulation.composeMetapopulation(mission).variant, expected, mission);
  }
}

function verifyTopologyEffects() {
  const graph = metapopulation.buildMigrationGraph(['a', 'b', 'c', 'd'], { variant: 'stepping-stone' });
  assert.equal(graph.length, 8);
  assert.ok(graph.every((edge) => Math.abs(edge.sourceDemeId.charCodeAt(0) - edge.targetDemeId.charCodeAt(0)) === 1
    || ['a', 'd'].includes(edge.sourceDemeId) && ['a', 'd'].includes(edge.targetDemeId)));
  const persistent = metapopulation.composeMetapopulation('Keep a resident population between missions.', { variantId: 'persistent' });
  assert.equal(persistent.scope, 'workspace');
  assert.equal(persistent.variantPolicy.retainRegionalMemory, true);
}

function assertSelection(mission, variant, migration) {
  const composition = metapopulation.composeMetapopulation(mission);
  assert.equal(composition.variant, variant);
  assert.equal(composition.variantPolicy.migration, migration);
  assert.ok(composition.variantSelection.method);
  assert.ok(composition.variantSelection.reasons.length);
}

function verifyPolicyEffects() {
  const members = [{ evidenceScore: 0.9 }, { evidenceScore: 0.1 }];
  assert.equal(metapopulation.senseQuorum(members, { variant: 'conservative' }).quorumRatio, 0.7);
  assert.equal(metapopulation.senseQuorum(members, { variant: 'conservative' }).reached, false);
  assert.equal(metapopulation.senseQuorum(members, { variant: 'exploratory' }).reached, true);
  assert.equal(metapopulation.senseQuorum(members, { variant: 'balanced', quorumRatio: 0.8 }).reached, false);
}

async function verifySessionPersistence() {
  const session = await metapopulation.createMetapopulationSession('Recover a region after population collapse.');
  const restored = await metapopulation.getMetapopulationSession(session.sessionId);
  assert.equal(restored.variant, 'resilient');
  assert.equal(restored.variantPolicy.migration, 'rescue');
  assert.equal(restored.variantSelection.method, 'mission_signals');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
