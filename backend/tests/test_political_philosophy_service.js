'use strict';

const assert = require('assert');
const service = require('../src/services/politicalPhilosophyService');
const router = require('../src/services/philosophyRouter');

const regime = service.classifyRegime({
  participation: { score: 0.9 },
  coercion: { score: 0.1 },
  pluralism: { score: 0.8 },
  accountability: { score: 0.9 },
});
assert.equal(regime.observations.classification, 'democratic');
assert.equal(regime.executable, false);
assert.equal(regime.evidenceRequired, true);

const legitimacy = service.assessLegitimacy({ consent: 0.8, legality: 0.9, rightsProtection: 0.7, publicJustification: 0.8 });
assert.equal(legitimacy.observations.legitimacyScore, 0.8);

const civil = service.assessCivilDisobedience({ injustice: 0.9, publicity: 0.8, nonviolence: 1, lastResort: 0.7 });
assert.ok(civil.observations.justificationStrength > 0.8);
assert.ok(civil.limitations.length > 0);

const surveillance = service.assessSurveillanceLiberty({ collection: 0.9, necessity: 0.2, proportionality: 0.2, oversight: 0.1, transparency: 0.1 });
assert.ok(surveillance.observations.libertyRisk > 0.7);

const concept = router.getConcept('politics.democratic-participation');
assert.equal(concept.status, 'implemented');
const evaluated = router.handlePhilosophyRequest({
  request: { operation: 'evaluateConcept', arguments: { concept: concept.id, mode: 'deliberative', deliberation: 0.9 } },
});
assert.ok(evaluated instanceof Promise);

evaluated.then((result) => {
  assert.equal(result.supported, true);
  assert.equal(result.result.framework, 'democratic-participation');
  console.log('Political philosophy service tests passed.');
}).catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
