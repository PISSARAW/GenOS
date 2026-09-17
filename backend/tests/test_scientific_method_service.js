'use strict';

const assert = require('node:assert/strict');
const scientific = require('../src/services/scientificMethodService');
const router = require('../src/services/philosophyRouter');

const confirmation = scientific.assessConfirmation({
  hypothesis: 'Le patch corrige le timeout',
  observations: ['test vert', 'replay vert'],
  compatible: true,
});
assert.equal(confirmation.status, 'supported-not-verified');

const falsification = scientific.assessFalsification({
  hypothesis: 'Le service répond sous 100 ms',
  predicted: '<100ms',
  observed: '250ms',
  auxiliaryAssumptions: ['réseau disponible'],
});
assert.equal(falsification.status, 'falsified-under-assumptions');

const method = scientific.assessHypotheticoDeductive({
  hypothesis: 'Le cache évite le second appel',
  predictions: ['appel-1', 'pas-appel-2'],
  observations: ['appel-1', 'pas-appel-2'],
});
assert.equal(method.status, 'predictions-supported');

const holistic = scientific.assessDuhemQuine({ hypothesis: 'H', auxiliaryAssumptions: ['A'], observedFailure: true });
assert.equal(holistic.status, 'holistic-failure');

router.handlePhilosophyRequest({
  request: { operation: 'evaluateConcept', arguments: { concept: 'science.confirmation', hypothesis: 'H', observations: ['O'], compatible: true } },
}).then((result) => {
  assert.equal(result.supported, true);
  assert.equal(result.result.status, 'supported-not-verified');
  console.log('Confirmation, falsification and scientific methods: PASS');
}).catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
