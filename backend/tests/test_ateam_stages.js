const assert = require('node:assert/strict');
const aTeam = require('../src/services/aTeamService');
const coordination = require('../src/services/aTeamCoordinationService');

const team = coordination.composeTeam({ projectGoal: 'Integrated app', subSystems: ['frontend', 'backend', 'integration'] });
const plan = aTeam.planStages(team.members);
assert.deepEqual(plan.stages, [['frontend', 'backend'], ['integration']]);
assert.deepEqual(plan.order, ['frontend', 'backend', 'integration']);

const ordered = aTeam.orderByStage(team.members);
assert.deepEqual(ordered.map((member) => member.subSystem), ['frontend', 'backend', 'integration']);

// The consumer stage must be told which upstream domains it has to consume.
assert.equal(aTeam.dependencyPrompt('do work', ['frontend']), 'do work\nUpstream domains to consume before finalizing: frontend.');
assert.equal(aTeam.dependencyPrompt('do work', []), 'do work');
assert.equal(aTeam.dependencyPrompt('do work', ['frontend', 'frontend']), 'do work\nUpstream domains to consume before finalizing: frontend.');

console.log('A-Team members are ordered into pipeline stages and dependencies reach the worker prompt.');
