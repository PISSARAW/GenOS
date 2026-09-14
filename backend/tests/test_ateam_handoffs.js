const assert = require('node:assert/strict');
const aTeam = require('../src/services/aTeamService');
const coordination = require('../src/services/aTeamCoordinationService');

// compose must expose dependency metadata, otherwise buildHandoffs is always empty.
const members = aTeam.compose({ projectGoal: 'Build a React interface backed by an Express API', subSystems: ['frontend', 'backend', 'integration'] });
const observer = members.find((member) => member.subSystem === 'integration');
assert.equal(observer.label, 'integration');
assert.equal(observer.pipelineStage, 1);
assert.deepEqual(observer.dependsOn, ['frontend', 'backend']);
assert.deepEqual(observer.capabilities, ['integration']);

const team = coordination.composeTeam({ projectGoal: 'Build a React interface backed by an Express API', subSystems: ['frontend', 'backend', 'integration'] });
assert.equal(team.handoffs.length, 2);
assert.deepEqual(team.handoffs.map((handoff) => handoff.from), ['frontend', 'backend']);
assert.ok(team.handoffs.every((handoff) => handoff.to === 'integration'));

// Explicit dependencies for non-observer pipelines.
const staged = aTeam.compose({ projectGoal: 'Stage the work', subSystems: ['drafting', 'editing', 'publishing'], dependencies: { publishing: ['drafting', 'editing'] } });
assert.deepEqual(staged.find((member) => member.subSystem === 'publishing').dependsOn, ['drafting', 'editing']);
assert.equal(staged.find((member) => member.subSystem === 'drafting').dependsOn.length, 0);

console.log('A-Team handoffs are derived from real composition dependencies.');
