const assert = require('assert');
const trinity = require('../src/services/trinityService');

const interview = trinity.analyzeMission('Interview me to create a plan for the product.');
assert.equal(interview.recommended, true);
assert.equal(interview.interviewForPlan, true);
assert.equal(interview.decision, 'consider_after_interview');

const explicit = trinity.analyzeMission('Lance Trinity pour implémenter cette mission.');
assert.equal(explicit.explicitlyRequested, true);
assert.equal(explicit.decision, 'launch');
assert.equal(explicit.members.length, 3);
assert.equal(explicit.domain, 'software_engineering');

const literary = trinity.analyzeMission('Lance Trinity pour écrire une nouvelle littéraire.');
assert.equal(literary.domain, 'creative_writing');
assert.equal(literary.artifact, 'creative');
assert.deepEqual(literary.members.map((member) => member.role), [
  'direct_author', 'planned_author', 'self_correcting_literary_author'
]);

const security = trinity.analyzeMission('Use Trinity to secure OAuth permissions against exploits.');
assert.equal(security.domain, 'security');
assert.match(security.members[1].hypothesis, /threat model/i);

assert.equal(trinity.analyzeMission('Corrige ce test unitaire.').recommended, false);
assert.equal(trinity.analyzeMission('Explique Trinity sans le lancer.').recommended, false);
assert.equal(trinity.compose('Build the feature').length, 3);
assert.throws(() => trinity.compose(''), (error) => error.code === 'TRINITY_MISSION_REQUIRED');
console.log('Trinity intent checks passed.');
