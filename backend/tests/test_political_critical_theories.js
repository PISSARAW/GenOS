'use strict';

const assert = require('assert');
const service = require('../src/services/politicalPhilosophyService');
const router = require('../src/services/philosophyRouter');

const liberalism = service.assessLiberalism({ neutrality: 0.8, pluralism: 0.9, tolerance: 0.8, rightsProtection: 0.9 });
assert.strictEqual(liberalism.framework, 'liberalism');
assert.strictEqual(liberalism.executable, false);
assert.ok(liberalism.observations.liberalCompatibility > 0.8);

const conservatism = service.assessConservatism({ tradition: 0.9, organicOrder: 0.8, prudence: 0.8, reformPressure: 0.2 });
assert.strictEqual(conservatism.observations.changePosture, 'continuity-preferred');

const marxism = service.analyzeMarxism({ classConflict: 0.9, surplusValue: 0.8, alienation: 0.7, emancipation: 0.6 });
assert.ok(marxism.observations.exploitationSignal > 0.7);

const feminism = service.assessFeminism({ equality: 0.8, intersectionality: 0.9, consent: 0.9, reproductiveJustice: 0.8, patriarchy: 0.7 });
assert.ok(feminism.observations.inclusionSignal > 0.8);

Promise.all(['politics.liberalism', 'politics.conservatism', 'politics.socialism-marxism', 'politics.feminism'].map((concept) => router.handlePhilosophyRequest({
  request: { operation: 'evaluateConcept', arguments: { concept } },
}))).then((results) => {
  assert.ok(results.every((result) => result.supported === true));
  console.log('Political critical theories tests passed.');
}).catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
