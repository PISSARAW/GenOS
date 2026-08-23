const assert = require('assert');
const aTeam = require('./src/services/aTeamService');

const analysis = aTeam.analyzeMission('Construire une interface React, une API Express et sécuriser OAuth avec des tests.');
assert.equal(analysis.recommended, true);
assert.deepEqual(analysis.detectedDomains.slice(0, 3), ['frontend', 'backend', 'security']);
assert.equal(analysis.members.length, 3);
assert.equal(analysis.capabilityCoverage.uncovered.includes('quality'), true);
assert.equal(aTeam.analyzeMission('Résoudre une récurrence de programmation dynamique.').recommended, false);

const twoDomains = aTeam.analyzeMission('Construire une interface React et une API Express.');
assert.deepEqual(twoDomains.members.map((member) => member.role), ['frontend_engineer', 'backend_engineer']);
assert.equal(twoDomains.members.some((member) => member.role === 'integration_observer'), false);

const fiction = aTeam.analyzeMission(
  'Benchmark littéraire : rédige une nouvelle complexe avec conflit, twist final et trois lectures.'
);
assert.equal(fiction.recommended, true);
assert.equal(fiction.artifact, 'fiction');
assert.equal(fiction.primaryDomain, 'creative_writing');
assert.deepEqual(
  fiction.members.map((member) => member.role),
  ['literary_author', 'dramaturg', 'literary_critic']
);
assert.equal(fiction.capabilityCoverage.ratio, 1);
assert.deepEqual(fiction.capabilityCoverage.uncovered, []);
assert.equal(fiction.members.some((member) => member.role === 'quality_engineer'), false);

const explicitIntegration = aTeam.analyzeMission('Intégrer une interface React avec une API Express.');
assert.equal(explicitIntegration.members.some((member) => member.role === 'integration_observer'), true);

const members = aTeam.compose({
  projectGoal: 'Ship a secure application',
  subSystems: ['frontend', 'backend', 'security'],
  assignedRoles: ['frontend_engineer', 'backend_engineer', 'security_reviewer'],
  available: 3
});
assert.equal(members.length, 3);
assert.match(members[2].mission, /Owned competency domain: security/);
assert.throws(() => aTeam.compose({ projectGoal: 'One skill', subSystems: ['backend'] }), (error) => error.code === 'A_TEAM_MULTIDISCIPLINARY_REQUIRED');
assert.throws(() => aTeam.compose({ projectGoal: 'No room', subSystems: ['backend', 'security'], available: 1 }), (error) => error.code === 'WORKER_GARAGE_FULL');
console.log('A-Team composition checks passed.');
