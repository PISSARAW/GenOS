const assert = require('node:assert/strict');
const coordination = require('../src/services/aTeamCoordinationService');

const team = coordination.composeTeam({
  projectGoal: 'Build a React interface backed by an Express API with OAuth security.',
  subSystems: ['frontend', 'backend', 'security']
});
assert.equal(team.members.length, 3);
assert.equal(team.organization, 'specialist_expert_committee');
assert.ok(team.capabilityContract.required.includes('SIGNALING_BUS'));
assert.ok(team.capabilityContract.required.includes('LIGAND_RECEPTOR'));
assert.ok(team.capabilityContract.required.includes('ARENA_COMPETITION'));

const handoffs = coordination.buildHandoffs([
  { subSystem: 'dramaturgy', pipelineStage: 1, dependsOn: ['literary_creation'] },
  { subSystem: 'literary_criticism', pipelineStage: 2, dependsOn: ['literary_creation', 'dramaturgy'] }
]);
assert.equal(handoffs.length, 3);
assert.equal(handoffs[0].from, 'literary_creation');
assert.equal(handoffs[0].to, 'dramaturgy');
assert.equal(handoffs[0].signalType, 'ligand');
assert.ok(handoffs[0].content.startsWith('handoff:'));

const arbitration = coordination.arbitrateIntegration([
  { workerId: 'a', name: 'frontend', role: 'frontend_engineer', events: [{ evidenceReport: { outcome: 'success', coverage: 0.9, claims: [{ statement: 'Frontend compiled with full component coverage.', evidence: ['build'] }] } }] },
  { workerId: 'b', name: 'backend', role: 'backend_engineer', events: [{ evidenceReport: { outcome: 'success', coverage: 0.3, claims: [{ statement: 'Backend partial.', evidence: ['build'] }] } }] }
]);
assert.ok(Array.isArray(arbitration.leaderboard) && arbitration.leaderboard.length >= 1);
assert.ok(arbitration.kneePoint);

console.log('A-Team coordination wiring checks: PASS');
