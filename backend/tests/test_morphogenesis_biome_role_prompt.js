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

const steward = promptFor('resource_steward', 'specialist', 'biome:resource_steward');
assert.match(steward, /Produce the mission candidate/);
assert.match(steward, /check every item appears exactly once/);
assert.match(steward, /verify every capacity constraint/);

assert.equal(rolePrompt.morphogenesisRoleInstruction({ role: 'environment_mapper',
  morphologyTopology: 'rhizome' }), null,
'Biome role guidance must not leak into other topology prompts');

console.log('Biome morphogenesis role prompts match worker artifact contracts: PASS');
