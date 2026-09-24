'use strict';

const assert = require('node:assert/strict');
const { prepareTeamLifecycle } = require('../src/services/aTeam/lifecycle/teamLifecycleService');
const coordination = require('../src/services/aTeamCoordinationService');

const members = [
  { agentId: 'api', role: 'backend', capabilities: ['api'], authority: { owns: ['api'] }, dependsOn: [] },
  { agentId: 'ui', role: 'frontend', capabilities: ['ui'], authority: { owns: ['ui'] }, dependsOn: ['api'] }
];
const ready = prepareTeamLifecycle({
  goal: 'Deliver an authenticated profile experience',
  successCriteria: ['API and UI work together', 'Evidence is attached'],
  members,
  requiredCapabilities: [{ capability: 'api' }, { capability: 'ui' }],
  availableSlots: 2
});
assert.equal(ready.readiness.status, 'TEAM_READY');
assert.equal(ready.teamContract.contractHash.length, 64);
assert.equal(ready.teamContract.contractHash, prepareTeamLifecycle({
  goal: 'Deliver an authenticated profile experience',
  successCriteria: ['API and UI work together', 'Evidence is attached'],
  members,
  requiredCapabilities: [{ capability: 'api' }, { capability: 'ui' }],
  availableSlots: 2
}).teamContract.contractHash);

const blocked = prepareTeamLifecycle({ goal: 'Incomplete team', members, successCriteria: [], availableSlots: 1 });
assert.equal(blocked.readiness.ready, false);
assert.deepEqual(blocked.readiness.blockers, ['successCriteria', 'capacity']);

const composed = coordination.composeTeam({
  projectGoal: 'Connect a React UI and an Express API.',
  subSystems: ['frontend', 'backend'],
  successCriteria: ['The UI consumes the API contract.'],
  available: 2
});
assert.equal(composed.readiness.status, 'TEAM_READY');
console.log('A-Team prebrief and readiness gate: OK');
