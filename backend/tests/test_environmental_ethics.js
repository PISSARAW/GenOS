'use strict';

const assert = require('assert');
const service = require('../src/services/environmentalEthicsService');
const router = require('../src/services/philosophyRouter');

const ecology = service.assessEcologicalPerspective({ anthropocentrism: 0.2, biocentrism: 0.8, ecocentrism: 0.9 });
assert.strictEqual(ecology.observations.dominantPerspective, 'ecocentrism');
const animal = service.assessAnimalInterests({ action: { id: 'experiment' }, sentience: 0.9, interests: ['avoid-pain'] });
assert.strictEqual(animal.observations.verdict, 'requires-animal-interest-review');
const sustainability = service.assessSustainability({ currentUse: 0.4, regeneration: 0.8, intergenerationalImpact: 0.2 });
assert.strictEqual(sustainability.observations.verdict, 'sustainable-candidate');
const precaution = service.assessPrecaution({ uncertainty: 0.9, severity: 0.8, irreversibility: 0.8 });
assert.strictEqual(precaution.observations.verdict, 'precaution-triggered');
const externality = service.assessExternality({ privateCost: 0.2, socialCost: 0.8 });
assert.strictEqual(externality.observations.verdict, 'negative-externality');
const commons = service.assessCommons({ users: ['a', 'b'], resourceCapacity: 10, aggregateDemand: 15, governance: 0.2 });
assert.strictEqual(commons.observations.verdict, 'commons-degradation-risk');

const routerArguments = {
  'ethics.environmental-ethics': {},
  'ethics.animal-rights': { action: { id: 'review' } },
  'ethics.precautionary-principle': {},
  'ethics.externalities': {},
  'ethics.commons': {},
};
Promise.all(Object.entries(routerArguments).map(([concept, arguments_]) => router.handlePhilosophyRequest({ request: { operation: 'evaluateConcept', arguments: { concept, ...arguments_ } } }))).then((results) => {
  assert.ok(results.every((result) => result.supported === true));
  console.log('Environmental ethics tests passed.');
}).catch((error) => { console.error(error.stack || error.message); process.exit(1); });
