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
'Repartis item1=2, item2=3 en 3 groupes, plafond de 8.\nRéponds au schéma de preuve GenOS complet: outcome=success.');
assert.match(observerMission, /item1=2,item2=3;groups=3;max=8/);
assert.match(observerMission, /"observation":"item1=2,item2=3"/);
assert.match(observerMission, /they are sufficient, so do not return unresolved/);
assert.match(observerMission, /\"observations\"/);
assert.doesNotMatch(observerMission, /Phase 1|sans concertation|Contrainte revelee/);
assert.doesNotMatch(observerMission, /Réponds au schéma de preuve GenOS complet/);

const stewardMission = rolePrompt.morphogenesisMissionPrompt({ workerAssignment: {
  topology: 'biome', topologyRole: 'resource_steward' } },
'Repartis item1=1, item2=3, item3=2, item4=4, item5=1, item6=3, item7=5, item8=4, item9=1 en 3 groupes, plafond de 8.');
assert.match(stewardMission, /Total=24; each group must sum exactly 8/);
assert.match(stewardMission, /Use every item exactly once/);
assert.match(stewardMission, /largest value 5 first and reserve a complement of 3/);
assert.match(stewardMission, /verify item count and each total/);
assert.doesNotMatch(stewardMission, /Phase 1|Contrainte revelee|N'utilise aucun outil/);


const steward = promptFor('resource_steward', 'specialist', 'biome:resource_steward');
assert.match(steward, /Produce the mission candidate/);
assert.match(steward, /verify every item appears exactly once/);
assert.match(steward, /check all capacities/);
assert.match(steward, /exact item identifiers \(item1, item2, etc\.\)/);

assert.equal(rolePrompt.morphogenesisRoleInstruction({ role: 'environment_mapper',
  morphologyTopology: 'rhizome' }), null,
'Biome role guidance must not leak into other topology prompts');

console.log('Biome morphogenesis role prompts match worker artifact contracts: PASS');
