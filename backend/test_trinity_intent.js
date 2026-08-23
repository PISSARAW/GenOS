const assert = require('assert');
const trinity = require('./src/services/trinityService');

const interview = trinity.analyzeMission('Interview me to create a plan for the product.');
assert.equal(interview.recommended, true);
assert.equal(interview.interviewForPlan, true);
assert.equal(interview.decision, 'consider_after_interview');

const explicit = trinity.analyzeMission('Lance Trinity pour implémenter cette mission.');
assert.equal(explicit.explicitlyRequested, true);
assert.equal(explicit.decision, 'launch');
assert.equal(explicit.members.length, 3);

assert.equal(trinity.analyzeMission('Corrige ce test unitaire.').recommended, false);
assert.equal(trinity.analyzeMission('Explique Trinity sans le lancer.').recommended, false);
assert.equal(trinity.compose('Build the feature').length, 3);
assert.throws(() => trinity.compose(''), (error) => error.code === 'TRINITY_MISSION_REQUIRED');
console.log('Trinity intent checks passed.');
