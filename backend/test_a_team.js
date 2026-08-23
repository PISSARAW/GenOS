const assert = require('assert');
const aTeam = require('./src/services/aTeamService');

const analysis = aTeam.analyzeMission('Construire une interface React, une API Express et sécuriser OAuth avec des tests.');
assert.equal(analysis.recommended, true);
assert.deepEqual(analysis.detectedDomains.slice(0, 3), ['frontend', 'backend', 'security']);
assert.equal(analysis.members.length, 3);
assert.equal(aTeam.analyzeMission('Résoudre une récurrence de programmation dynamique.').recommended, false);

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
