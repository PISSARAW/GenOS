const assert = require('node:assert/strict');
const coordination = require('../src/services/aTeamCoordinationService');

const team = coordination.composeTeam({ projectGoal: 'Build a React interface backed by an Express API', subSystems: ['frontend', 'backend'] });
assert.deepEqual(team.capabilityAudit.missing, []);
assert.ok(team.capabilityAudit.required.includes('SIGNALING_BUS'));
assert.ok(team.capabilityAudit.required.includes('LIGAND_RECEPTOR'));

const backed = coordination.toolBackedCapabilities();
assert.ok(team.capabilityAudit.required.every((capability) => backed.includes(capability)));

// Enforcement: a contract whose capabilities no tool can serve must be refused.
assert.throws(
  () => coordination.composeTeam({ projectGoal: 'Build a React interface backed by an Express API', subSystems: ['frontend', 'backend'], availableCapabilities: [] }),
  (error) => error.code === 'A_TEAM_CAPABILITY_MISSING' && error.missing.length > 0
);

// Opt-out remains available for dry planning.
const relaxed = coordination.composeTeam({ projectGoal: 'Build a React interface backed by an Express API', subSystems: ['frontend', 'backend'], availableCapabilities: [], enforceCapabilities: false });
assert.ok(relaxed.capabilityAudit.missing.length > 0);

console.log('A-Team capability contract is enforced against tool-backed capabilities.');
