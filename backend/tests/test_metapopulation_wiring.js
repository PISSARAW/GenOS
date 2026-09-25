const assert = require('node:assert/strict');
const metapopulation = require('../src/services/metapopulationCoordinationService');
const biologicalMode = require('../src/services/biologicalModeService');
const workerKinds = require('../src/services/topologyWorkerKindService');
const { validateSchedulingResult } = require('../src/services/metapopulation/schedulingEvidenceValidator');

const composition = metapopulation.composeMetapopulation('Partition the mission into semi-independent populations with quorum and regeneration.');
assert.equal(composition.members.length, 4);
assert.equal(composition.organization, 'quorum_with_abstention');
assert.ok(composition.capabilityContract.required.includes('QUORUM'));
assert.ok(composition.capabilityContract.required.includes('SYNAPTIC_PLASTICITY'));
assert.ok(composition.capabilityContract.required.includes('RESILIENCE_RECOVERY'));
assert.deepEqual(composition.mechanisms, ['quorum_sensing', 'synaptic_plasticity', 'regeneration']);

const parserMembers = biologicalMode.compose('metapopulation',
  'parseur commun : performance, lisibilité, tolérance aux entrées invalides et faible mémoire');
assert.equal(parserMembers.length, 4);
assert.deepEqual(parserMembers.map((member) => member.mission.match(/Assigned method: (.+?)\./)[1]),
  ['performance', 'lisibilité', 'tolérance aux entrées invalides', 'faible mémoire']);
assert.deepEqual(parserMembers.map((member) => member.workerKind),
  ['bounded_worker', 'bounded_worker', 'bounded_worker', 'bounded_worker']);
assert.deepEqual(workerKinds.applyTopologyWorkerKinds('metapopulation', parserMembers)
  .map((member) => member.workerKind), parserMembers.map((member) => member.workerKind));
const environmentMembers = biologicalMode.compose('metapopulation',
  'trois environnements : navigateur desktop, mobile à faible réseau et terminal très limité');
assert.equal(environmentMembers.length, 3);
assert.deepEqual(environmentMembers.slice(0, 3).map((member) => member.mission.match(/Assigned method: (.+?)\./)[1]),
  ['navigateur desktop', 'mobile à faible réseau', 'terminal limité']);
const scheduleMembers = biologicalMode.compose('metapopulation',
  'Trois populations indépendantes : LPT glouton, programmation dynamique subset-sum et recherche locale. Minimiser le makespan.');
assert.deepEqual(scheduleMembers.map((member) => member.mission.match(/Assigned method: (.+?)\./)[1]),
  ['gloutonne', 'programmation dynamique', 'recherche locale']);
assert.ok(scheduleMembers.every((member) => member.modelTier === 'frontier'));
const evolutionaryMembers = biologicalMode.compose('metapopulation',
  'Four populations use CP, dynamic programming, local search, and evolutionary search.');
assert.equal(evolutionaryMembers[3].workerKind, 'adaptive_worker');
const recoveryMembers = biologicalMode.compose('metapopulation',
  'Four populations optimize independently. Collapse one population, then recolonize it from multiple lineages.');
assert.equal(recoveryMembers[3].workerKind, 'recovery_worker');
const securityMembers = biologicalMode.compose('metapopulation',
  'Four populations audit a pseudo-system using threat modeling, logical analysis, adversarial thinking and invariant verification.');
assert.ok(securityMembers.every((member) => member.mission.includes('Do not assert any vulnerability.')));
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

const plan = metapopulation.regenerationPlan(['population_isolator', 'quorum_sensor', 'synaptic_adaptor'], { maxRespawn: 2 });
assert.deepEqual(plan.respawn, ['population_isolator', 'quorum_sensor']);
assert.equal(plan.degraded, true);
assert.ok(plan.sources.includes('lineage'));

const weighted = metapopulation.connectionWeights([{ id: 'a->b', weight: 0.5 }, { id: 'b->c', weight: 0.9 }], { 'a->b': 2, 'b->c': -5 });
assert.equal(weighted[0].weight, 0.7);
assert.equal(weighted[1].weight, 0.4);

assert.throws(() => metapopulation.composeMetapopulation(''), (error) => error.code === 'METAPOPULATION_MISSION_REQUIRED');
console.log('Metapopulation wiring checks: PASS');
