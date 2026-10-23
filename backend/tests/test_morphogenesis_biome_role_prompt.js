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
      mission: { prompt: 'Allocate the items into three bins of capacity eight.' },
      parent: { current_task: 'Allocate the items into three bins of capacity eight.' },
      plan: { tokenPolicy: { allocation: 'uniform' } },
      perWorkerTokens: 1500
    }
  });
}

const observer = promptFor('environment_mapper', 'scout_cell');
assert.match(observer, /Observe the entities, values, units, and constraints/);
assert.match(observer, /required scout_observation artifact/);
assert.match(observer, /do not produce or claim the final solution/);
assert.match(observer, /do not return unresolved/);

const observerMission = rolePrompt.morphogenesisMissionPrompt({ workerAssignment: {
  topology: 'biome', topologyRole: 'environment_mapper' } },
'Repartis item1=2, item2=3 en 3 groupes, plafond de 8.\nRéponds au schéma de preuve GenOS complet: outcome=success.');
assert.match(observerMission, /item1=2;groups=3;max=8/);
assert.match(observerMission, /\"observations\"/);
assert.doesNotMatch(observerMission, /Phase 1|sans concertation|Contrainte revelee/);
assert.doesNotMatch(observerMission, /Réponds au schéma de preuve GenOS complet/);

const steward = promptFor('resource_steward', 'specialist', 'biome:resource_steward');
assert.match(steward, /Produce the mission candidate/);
assert.match(steward, /verify every item appears exactly once/);
assert.match(steward, /check all capacities/);
assert.match(steward, /exact item identifiers \(item1, item2, etc\.\)/);

assert.equal(rolePrompt.morphogenesisRoleInstruction({ role: 'environment_mapper',
  morphologyTopology: 'rhizome' }), null,
'Biome role guidance must not leak into other topology prompts');

console.log('Biome morphogenesis role prompts match worker artifact contracts: PASS');
