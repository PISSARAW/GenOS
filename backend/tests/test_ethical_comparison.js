'use strict';

const assert = require('assert');
const service = require('../src/services/ethicalComparisonService');
const router = require('../src/services/philosophyRouter');

const comparison = service.compareEthicalFrameworks({
  scenario: { id: 'resource-allocation', action: { id: 'allocate' } },
  frameworks: ['utilitarianism', 'deontology', 'rawlsianJustice', 'care'],
  argumentsByFramework: {
    utilitarianism: { action: { id: 'allocate' }, outcomes: [{ utility: 2 }] },
    deontology: { action: { id: 'allocate' }, maxim: 'Aider les personnes sans falsifier les preuves' },
    rawlsianJustice: { distribution: { worstOff: 1, other: 3 } },
    care: { actor: 'allocator', recipient: 'worstOff', need: 0.8, vulnerability: 0.8, response: 0.7 },
  },
  evidenceRefs: ['evidence-1'],
});
assert.strictEqual(comparison.humanReviewRequired, true);
assert.strictEqual(comparison.executable, false);
assert.strictEqual(comparison.decisionStatus, 'requires-human-judgment');
assert.deepStrictEqual(comparison.provenance.evidenceRefs, ['evidence-1']);
assert.strictEqual(comparison.evaluations.length, 4);
assert.ok(comparison.disagreements.length > 0);

router.handlePhilosophyRequest({ request: { operation: 'compareEthicalFrameworks', arguments: { scenario: { id: 'triage' }, frameworks: ['utilitarianism', 'deontology'] } } }).then((result) => {
  assert.strictEqual(result.humanReviewRequired, true);
  console.log('Ethical comparison tests passed.');
}).catch((error) => { console.error(error.stack || error.message); process.exit(1); });
