const assert = require('node:assert/strict');
const metapopulation = require('../src/services/metapopulationCoordinationService');
const biologicalMode = require('../src/services/biologicalModeService');
const workerKinds = require('../src/services/topologyWorkerKindService');
const { validateSchedulingResult } = require('../src/services/metapopulation/schedulingEvidenceValidator');

const composition = metapopulation.composeMetapopulation('Partition the mission into semi-independent populations with quorum and regeneration.');
assert.equal(composition.members.length, 4);
assert.equal(composition.variant, 'balanced');
assert.equal(composition.variantSelection.method, 'safe_baseline');
assert.equal(composition.organization, 'quorum_with_abstention');
assert.ok(composition.capabilityContract.required.includes('QUORUM'));
assert.ok(composition.capabilityContract.required.includes('SYNAPTIC_PLASTICITY'));
assert.ok(composition.capabilityContract.required.includes('RESILIENCE_RECOVERY'));
assert.deepEqual(composition.mechanisms, ['quorum_sensing', 'synaptic_plasticity', 'regeneration']);

const resilienceMission = metapopulation.composeMetapopulation('Recover from population collapse and recolonize failed regions.');
assert.equal(resilienceMission.variant, 'resilient');
assert.equal(resilienceMission.variantPolicy.migration, 'rescue');
assert.ok(resilienceMission.variantSelection.reasons.includes('MISSION_SIGNAL:collapse'));
const explorationMission = metapopulation.composeMetapopulation('Explore unknown hypotheses and discover novel approaches.');
assert.equal(explorationMission.variant, 'exploratory');
assert.equal(explorationMission.variantPolicy.migration, 'novelty');
const conservativeMission = metapopulation.composeMetapopulation('Run a security audit and verify compliance risks.');
assert.equal(conservativeMission.variant, 'conservative');
assert.equal(conservativeMission.variantPolicy.quorumRatio, 0.7);
assert.equal(metapopulation.composeMetapopulation('Explore novel options after a regional outage.', { variant: 'balanced' }).variant, 'balanced');
assert.throws(() => metapopulation.composeMetapopulation('Check recovery.', { variant: 'missing' }),
  (error) => error.code === 'METAPOPULATION_VARIANT_UNKNOWN');

const parserMembers = biologicalMode.compose('metapopulation',
  'parseur commun : performance, lisibilité, tolérance aux entrées invalides et faible mémoire');
assert.equal(parserMembers.length, 4);
const parserPlan = workerKinds.applyTopologyWorkerKinds('metapopulation', parserMembers);
assert.deepEqual(parserPlan.map((member) => member.workerKind),
  ['bounded_worker', 'scout_cell', 'adaptive_worker', 'recovery_worker']);
assert.ok(parserPlan.every((member) => member.methodContract.methodId === 'prompt_defined'));
const environmentMembers = biologicalMode.compose('metapopulation',
  'trois environnements : navigateur desktop, mobile à faible réseau et terminal très limité');
assert.equal(environmentMembers.length, 3);
assert.ok(environmentMembers.every((member) => member.mission.includes('Assigned method: method_unspecified.')));
const scheduleMembers = biologicalMode.compose('metapopulation',
  'Trois populations indépendantes : LPT glouton, programmation dynamique subset-sum et recherche locale. Minimiser le makespan.');
assert.ok(scheduleMembers.every((member) => member.modelTier === 'frontier'));
const evolutionaryMembers = biologicalMode.compose('metapopulation',
  'Four populations use CP, dynamic programming, local search, and evolutionary search.');
assert.ok(evolutionaryMembers.every((member) => !member.workerKind));
const recoveryMembers = biologicalMode.compose('metapopulation',
  'Four populations optimize independently. Collapse one population, then recolonize it from multiple lineages.');
assert.ok(recoveryMembers.every((member) => !member.workerKind));
const methodAssigned = workerKinds.applyTopologyWorkerKinds('metapopulation', parserMembers, {
  population_isolator: { methodContract: { version: 1, methodId: 'dynamic_programming' } },
  quorum_sensor: { methodContract: { version: 1, methodId: 'evidence_sensing', requiredCapabilities: ['observe'] } },
  synaptic_adaptor: { methodContract: { version: 1, methodId: 'evolutionary_search' } },
  regeneration_steward: { methodContract: { version: 1, methodId: 'recolonization' } }
});
assert.deepEqual(methodAssigned.map((member) => member.workerKind), [
  'procedural_executor', 'scout_cell', 'adaptive_worker', 'recovery_worker'
]);
assert.ok(methodAssigned.every((member) => member.mission.includes('METHOD CONTRACT')));
assert.throws(() => workerKinds.applyTopologyWorkerKinds('metapopulation', scheduleMembers, {
  population_isolator: { workerKind: 'adaptive_worker', methodContract: { version: 1, methodId: 'dynamic_programming' } }
}), { code: 'WORKER_KIND_CAPABILITY_MISMATCH' });
const securityMembers = biologicalMode.compose('metapopulation',
  'Four populations audit a pseudo-system using threat modeling, logical analysis, adversarial thinking and invariant verification.');
assert.ok(securityMembers.every((member) => member.mission.includes('unverified hypotheses')));
const scheduleMission = 'Tâches A=2, B=3, C=4, D=5, E=6 sur deux machines. LPT, subset-sum, local search. Minimiser le makespan.';
assert.equal(validateSchedulingResult({ mission: scheduleMission, method: 'gloutonne',
  answer: 'Machine 1 -> E (6), B (3), A (2); Machine 2 -> D (5), C (4). Makespan = 11.' }).valid, true);
assert.equal(validateSchedulingResult({ mission: scheduleMission, method: 'gloutonne',
  answer: 'Machine 1 -> A (2), C (4), E (6); Machine 2 -> B (3), D (5). Makespan = 12.' }).valid, false);
assert.equal(validateSchedulingResult({ mission: scheduleMission, method: 'programmation dynamique',
  answer: 'Machine 1 -> C (4), E (6); Machine 2 -> A (2), B (3), D (5). Makespan = 10.' }).valid, true);
assert.equal(validateSchedulingResult({ mission: scheduleMission, method: 'recherche locale',
  answer: 'Machine 1 -> C (4), E (6); Machine 2 -> A (2), B (3), D (5). Makespan = 10.' }).valid, true);
assert.equal(validateSchedulingResult({ mission: scheduleMission, method: 'programmation dynamique',
  answer: 'Machine 1 -> A (2), B (3); Machine 2 -> C (4), D (5). Makespan = 9.' }).valid, false);

const reached = metapopulation.senseQuorum([
  { agentId: 'a', evidenceScore: 0.9, weight: 2 },
  { agentId: 'b', evidenceScore: 0.7, weight: 1 },
  { agentId: 'c', evidenceScore: 0.2, weight: 1 }
]);
assert.equal(reached.reached, true);
assert.equal(reached.support, 0.75);

const notReached = metapopulation.senseQuorum([{ agentId: 'a', evidenceScore: 0.1 }], { quorumRatio: 0.5 });
assert.equal(notReached.reached, false);
const conservativeQuorum = metapopulation.senseQuorum([
  { agentId: 'a', evidenceScore: 0.9 }, { agentId: 'b', evidenceScore: 0.1 }
], { variant: 'conservative' });
assert.equal(conservativeQuorum.quorumRatio, 0.7);
assert.equal(conservativeQuorum.reached, false);

const plan = metapopulation.regenerationPlan(['population_isolator', 'quorum_sensor', 'synaptic_adaptor'], { maxRespawn: 2 });
assert.deepEqual(plan.respawn, ['population_isolator', 'quorum_sensor']);
assert.equal(plan.degraded, true);
assert.ok(plan.sources.includes('lineage'));

const weighted = metapopulation.connectionWeights([{ id: 'a->b', weight: 0.5 }, { id: 'b->c', weight: 0.9 }], { 'a->b': 2, 'b->c': -5 });
assert.equal(weighted[0].weight, 0.7);
assert.equal(weighted[1].weight, 0.4);

assert.throws(() => metapopulation.composeMetapopulation(''), (error) => error.code === 'METAPOPULATION_MISSION_REQUIRED');
console.log('Metapopulation wiring checks: PASS');
