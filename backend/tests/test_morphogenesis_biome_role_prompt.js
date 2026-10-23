'use strict';

const assert = require('node:assert/strict');
const workers = require('../src/services/agentFleetWorkers');
const rolePrompt = require('../src/services/morphogenesisRolePrompt');

function promptFor(role, workerKind, specialtyNiche) {
  return workers.buildWorkerPrompt({
    identity: { introduction: 'You are a GenOS worker.' },
    conscience: { dissonanceLevel: 0 },
    assignment: {
      label: role,
      role,
      hypothesis: 'Use the assigned Biome function.',
      workerKind,
      specialtyNiche,
      workerAssignment: { topology: 'biome', topologyRole: role,
        nicheDomain: specialtyNiche }
    },
    context: {
      mission: { prompt: 'Repartis item1=1, item2=3, item3=2 en 3 groupes, plafond de 8.' },
      parent: { current_task: 'Repartis item1=1, item2=3, item3=2 en 3 groupes, plafond de 8.' },
      plan: { tokenPolicy: { allocation: 'uniform' } },
      perWorkerTokens: 1500
    }
  });
}

const observer = promptFor('environment_mapper', 'scout_cell');
assert.match(observer, /Observe the entities, values, units, and constraints/);
assert.match(observer, /required scout_observation artifact/);
assert.match(observer, /do not produce or claim the final solution/);
assert.match(observer, /If the available evidence is insufficient/);
assert.match(observer, /item1=1,item2=3,item3=2;count=3;groups=3;max=8/);

const observerMission = rolePrompt.morphogenesisMissionPrompt({ workerAssignment: {
  topology: 'biome', topologyRole: 'environment_mapper' } },
'Phase 1: répartis item1=2, item2=3. Contrainte: chaque groupe ne doit pas dépasser un total de 8; répartis en 3 groupes.\nRéponds au schéma de preuve GenOS complet: outcome=success.');
assert.match(observerMission, /items=item1=2,item2=3;count=2;groups=3;max=8/);
assert.match(observerMission, /"observation":"item1=2,item2=3"/);
assert.match(observerMission, /they are sufficient, so do not return unresolved/);
assert.match(observerMission, /\"observations\"/);
assert.doesNotMatch(observerMission, /Phase 1|sans concertation|Contrainte revelee/);
assert.doesNotMatch(observerMission, /Réponds au schéma de preuve GenOS complet/);
const realPrompt = 'Phase 1: répartis item1=1, item2=3, item3=2 en 3 groupes sans concertation. Contrainte révélée: aucun groupe ne doit dépasser un total de 8, et chaque élément doit appartenir à exactement un groupe.';
const realObserverMission = rolePrompt.morphogenesisMissionPrompt({ workerAssignment: {
  topology: 'biome', topologyRole: 'environment_mapper' } }, realPrompt);
assert.match(realObserverMission, /items=item1=1,item2=3,item3=2;count=3;groups=3;max=8/);
const normalizedPrompt = 'Phase 1: item1=1, item2=3, item3=2 en 3 groupes. Aucun groupe ne doit depasser un total de 8.';
assert.equal(rolePrompt.morphogenesisWorkerAssignments({}, 'biome', normalizedPrompt)
  .environment_mapper.methodContract.methodId, 'scan_literal',
'Accent-normalized French capacity constraints still bind the native scout method.');
const nativeMapperAssignments = rolePrompt.morphogenesisWorkerAssignments({}, 'biome', realPrompt);
assert.equal(nativeMapperAssignments.environment_mapper.methodContract.methodId, 'scan_literal');
assert.deepEqual(nativeMapperAssignments.environment_mapper.methodContract.parameters.terms.slice(0, 3),
  ['item1=1', 'item2=3', 'item3=2']);
assert.equal(nativeMapperAssignments.environment_mapper.methodContract.parameters.sources[0].sourceRef, 'mission');
const arrayAssignments = rolePrompt.morphogenesisWorkerAssignments([
  { role: 'environment_mapper', topology: 'biome', methodContract: { version: 1, methodId: 'prompt_defined' } }
], 'parallel_forks', realPrompt);
assert.equal(arrayAssignments[0].methodContract.methodId, 'scan_literal',
  'Array-based Biome assignments also replace the generic method.');
const dispatchedMapper = rolePrompt.bindBiomeMapperAssignment({ role: 'environment_mapper',
  workerAssignment: { topology: 'biome', topologyRole: 'environment_mapper', methodContract: { version: 1, methodId: 'prompt_defined' } } }, realPrompt);
assert.equal(dispatchedMapper.methodContract.methodId, 'scan_literal');
const roleOnlyMapper = rolePrompt.bindBiomeMapperAssignment({ role: 'environment_mapper',
  methodContract: { version: 1, methodId: 'prompt_defined' } }, realPrompt);
assert.equal(roleOnlyMapper.methodContract.methodId, 'scan_literal',
  'Fleet dispatch binds Biome mapper contracts even when morphology metadata was omitted.');
const topologyKinds = require('../src/services/topologyWorkerKindService');
const composedMapper = topologyKinds.applyTopologyWorkerKinds('biome', [{ role: 'environment_mapper',
  mission: realPrompt }])[0];
assert.equal(composedMapper.methodContract.methodId, 'scan_literal',
  'Biome composition binds literal evidence collection before worker dispatch.');
assert.equal(composedMapper.workerAssignment.methodContract.methodId, 'scan_literal');
const requestedBiomeMapper = topologyKinds.applyTopologyWorkerKinds('parallel_forks', [{ role: 'environment_mapper',
  mission: realPrompt, workerAssignment: { topology: 'biome', selectionSource: 'capability_match' } }])[0];
assert.equal(requestedBiomeMapper.methodContract.methodId, 'scan_literal',
  'Biome roles retain their native evidence method across a composite topology graph.');

const stewardMission = rolePrompt.morphogenesisMissionPrompt({ workerAssignment: {
  topology: 'biome', topologyRole: 'resource_steward' } },
'Repartis item1=1, item2=3, item3=2, item4=4, item5=1, item6=3, item7=5, item8=4, item9=1 en 3 groupes, plafond de 8.');
assert.match(stewardMission, /Total=24; each group must sum exactly 8/);
assert.match(stewardMission, /Use all 9 items exactly once/);
assert.match(stewardMission, /largest value 5 first and reserve a complement of 3/);
assert.match(stewardMission, /Deterministically verified assignment: \{"bins":\[\["item7","item2"\],\["item4","item8"\],\["item6","item3","item1","item5","item9"\]\]\}/);
assert.match(stewardMission, /verify item count and each total/);
assert.doesNotMatch(stewardMission, /Phase 1|Contrainte revelee|N'utilise aucun outil/);


const steward = promptFor('resource_steward', 'specialist', 'biome:resource_steward');
assert.match(steward, /Produce the mission candidate/);
assert.match(steward, /verify every item appears exactly once/);
assert.match(steward, /check all capacities/);
assert.match(steward, /This niche includes exact resource allocation, partitioning, and capacity verification/);
assert.match(steward, /\"outcome\":\"unresolved\",\"claims\":\[\],\"uncertainties\"/);
assert.match(steward, /exact item identifiers \(item1, item2, etc\.\)/);

assert.equal(rolePrompt.morphogenesisRoleInstruction({ role: 'environment_mapper',
  morphologyTopology: 'rhizome' }), null,
'Biome role guidance must not leak into other topology prompts');

console.log('Biome morphogenesis role prompts match worker artifact contracts: PASS');
