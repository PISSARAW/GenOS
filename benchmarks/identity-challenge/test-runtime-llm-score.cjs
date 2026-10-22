'use strict';

const assert = require('node:assert/strict');
const { score } = require('./runtime-llm.cjs');

const run = { scenario: 'C', arm: 'genos_full' };
const fullTreatment = { selfModelFacts: { calibratedConfidencePercent: 58 } };
const validFull = JSON.stringify({
  outcome: 'success',
  claims: [{ statement: 'confidence_percent: 58%; decision: defer', evidence: ['worker_self'] }]
});

assert.equal(score(run, validFull, fullTreatment).passed, true);
assert.equal(score(run, validFull.replace('58%', '57%'), fullTreatment).passed, false);
assert.equal(score(run, validFull.replace('58%', '58'), fullTreatment).passed, false);
assert.equal(score(run, validFull.replace('decision: defer', 'decision: accept'), fullTreatment).passed, false);
assert.equal(score(run, validFull.replace('decision: defer', 'decision is defer'), fullTreatment).passed, false);
assert.equal(score(run, validFull.replace('"worker_self"', '"mission"'), fullTreatment).passed, false);

const maskedRun = { scenario: 'C', arm: 'llm_only' };
const maskedTreatment = { selfModelFacts: null };
const validAbstention = JSON.stringify({ outcome: 'unresolved', claims: [], uncertainties: ['confidence_percent'] });
assert.equal(score(maskedRun, validAbstention, maskedTreatment).passed, true);
assert.equal(score(maskedRun, validAbstention.replace('unresolved', 'success'), maskedTreatment).passed, false);
assert.equal(score(maskedRun, `${validAbstention} 58%`, maskedTreatment).passed, false);
assert.equal(score(maskedRun, JSON.stringify({ outcome: 'unresolved', claims: [], uncertainties: [] }), maskedTreatment).passed, false);

console.log('Identity runtime C oracle: full, provenance, decision, and abstention cases passed.');
