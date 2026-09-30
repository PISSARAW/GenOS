'use strict';

const assert = require('node:assert/strict');
const { attachGlobalWorkspace } = require('../src/services/agentRuntimeAdapter/missionPlanning');
const { missionText } = require('../src/services/agentAutonomyPlanService');

const ctx = {
  agentId: 'workspace-runtime-test',
  normalizedMission: { prompt: 'résoudre une tâche de test' }
};

attachGlobalWorkspace(ctx);
assert.equal(ctx.globalWorkspace.ignited, true);
for (const module of ['planning', 'execution', 'reporting']) {
  assert.equal(ctx.globalWorkspace.consumers[module].available, true);
  assert.equal(ctx.globalWorkspace.consumers[module].consumed, true);
}
assert.equal(missionText(ctx.normalizedMission), 'résoudre une tâche de test');

const denied = { prompt: 'texte local', globalWorkspace: { consumers: { planning: { available: false, consumed: false } } } };
assert.equal(missionText(denied), 'texte local');
console.log('✅ global workspace production wiring passed');
