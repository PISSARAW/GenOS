'use strict';

const assert = require('node:assert/strict');
const probability = require('../src/services/probabilityService');
const router = require('../src/services/philosophyRouter');

const subjective = probability.assessProbability({ value: 0.7, mode: 'subjective', basis: 'agent-belief' });
assert.equal(subjective.status, 'well-formed');
assert.equal(subjective.mode, 'subjective');

const distribution = probability.assessDistribution({ distribution: [0.2, 0.3, 0.5], mode: 'objective' });
assert.equal(distribution.status, 'coherent');
assert.equal(distribution.sum, 1);

const update = probability.bayesUpdate({ prior: 0.2, likelihood: 0.8, likelihoodNotH: 0.1 });
assert.equal(update.status, 'updated');
assert.equal(Number(update.posterior.toFixed(3)), 0.667);

router.handlePhilosophyRequest({
  request: { operation: 'evaluateConcept', arguments: { concept: 'method.bayesianism', prior: 0.2, likelihood: 0.8, likelihoodNotH: 0.1 } },
}).then((result) => {
  assert.equal(result.supported, true);
  assert.equal(result.result.status, 'updated');
  console.log('Probabilism and Bayesianism: PASS');
}).catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
