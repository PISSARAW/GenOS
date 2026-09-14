const assert = require('node:assert/strict');
const coordination = require('../src/services/aTeamCoordinationService');

// A normal multidisciplinary mission stays on the default expert committee.
const base = coordination.composeTeam({ projectGoal: 'Build a React interface backed by an Express API with OAuth security.', subSystems: ['frontend', 'backend'] });
assert.equal(base.organization, 'specialist_expert_committee');

// A strong adversarial signal moves the team to red/blue coevolution.
const adversarial = coordination.composeTeam({ projectGoal: 'Run an adversarial red team review of the authentication flow.', subSystems: ['frontend', 'security'] });
assert.equal(adversarial.organization, 'red_blue_coevolution');
assert.equal(adversarial.capabilityContract.organization, 'red_blue_coevolution');

// An explicit organization is honoured.
const explicit = coordination.composeTeam({ projectGoal: 'Compare strategies', subSystems: ['frontend', 'backend'], organization: 'strategy_arena' });
assert.equal(explicit.organization, 'strategy_arena');

// The registry is complete and unknown organizations are refused.
assert.ok(coordination.KNOWN_ORGANIZATIONS.length >= 19);
assert.ok(coordination.KNOWN_ORGANIZATIONS.includes('memory_compilation'));
assert.throws(() => coordination.selectOrganization({ organization: 'not_a_real_team' }), (error) => error.code === 'A_TEAM_UNKNOWN_ORGANIZATION');

console.log('A-Team selects a communication organization from signals or an explicit override.');
