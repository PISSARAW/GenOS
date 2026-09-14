const assert = require('node:assert/strict');
const aTeamService = require('../src/services/aTeamService');
const { attachAteamCoordination } = require('../src/services/agentAutonomyPlanService');

const aTeam = aTeamService.analyzeMission('Intégrer une interface React avec une API Express.');
aTeam.activated = true;
assert.equal(aTeam.members.some((member) => member.role === 'integration_observer'), true);

const events = [];
attachAteamCoordination({ aTeam, agentId: 'orch-ateam-test', emitEvent: (agentId, type) => events.push(type) });

assert.equal(aTeam.organization, 'specialist_expert_committee');
assert.equal(aTeam.capabilityContract.mode, 'a_team');
assert.deepEqual(aTeam.capabilityAudit.missing, []);
assert.equal(aTeam.handoffs.length, 2);
assert.equal(aTeam.activated, true);
assert.deepEqual(events, []);

console.log('The automatic autonomy plan attaches the same A-Team coordination contract.');
