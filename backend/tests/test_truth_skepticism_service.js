'use strict';

const assert = require('node:assert/strict');
const service = require('../src/services/truthSkepticismService');
const router = require('../src/services/philosophyRouter');

const coherence = service.evaluateTruthTheory({ theory: 'coherence', proposition: 'P', criterion: true });
assert.equal(coherence.status, 'criterion-satisfied');
assert.equal(coherence.truthEstablished, false);

const skepticism = service.assessSkepticism({ claim: 'P', challenge: 'radical', evidenceCount: 1 });
assert.equal(skepticism.status, 'challenge-open');
assert.equal(skepticism.suspensionRecommended, true);

const relativism = service.assessRelativism({ claim: 'P', context: 'C1', alternativeContext: 'C2', standardsCompatible: false });
assert.equal(relativism.status, 'context-relative-disagreement');
assert.equal(relativism.universalValidity, false);

router.handlePhilosophyRequest({
  request: { operation: 'evaluateConcept', arguments: { concept: 'truth.correspondence', proposition: 'P', criterion: true } },
}).then((result) => {
  assert.equal(result.supported, true);
  assert.equal(result.result.theory, 'correspondence');
  console.log('Truth, skepticism and relativism: PASS');
}).catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
