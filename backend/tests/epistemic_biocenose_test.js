'use strict';

const assert = require('node:assert');
const B = require('../src/services/epistemic/epistemicBiocenoseService');

// ---- species richness ----

assert.strictEqual(B.speciesRichness([{ type: 'a' }, { type: 'b' }]), 2);
assert.strictEqual(B.speciesRichness([{ type: 'a' }, { type: 'a' }]), 1);
assert.strictEqual(B.speciesRichness([]), 0);

// ---- functional diversity ----

const diverse = [
  { type: 'testResult', niche: 'testResult' },
  { type: 'replay', niche: 'replay' },
  { type: 'source', niche: 'source' },
];
assert.ok(B.functionalDiversity(diverse) > 0);
assert.strictEqual(B.functionalDiversity([]), 0);

// ---- error diversity ----

const varied = [
  { type: 'a', errorRate: 0.1 },
  { type: 'b', errorRate: 0.5 },
  { type: 'c', errorRate: 0.9 },
];
assert.ok(B.errorDiversity(varied) > 0);
assert.strictEqual(B.errorDiversity([]), 0);

// ---- effective diversity ----

const monoculture = [
  { type: 'testResult', niche: 'testResult', errorRate: 0.1, provider: 'gpt', strategy: ['s1'] },
  { type: 'testResult', niche: 'testResult', errorRate: 0.1, provider: 'gpt', strategy: ['s1'] },
  { type: 'testResult', niche: 'testResult', errorRate: 0.1, provider: 'gpt', strategy: ['s1'] },
];
assert.ok(B.effectiveDiversity(monoculture) < 0.3);
assert.ok(B.isMonoculture(monoculture));

const realDiverse = [
  { type: 'testResult', niche: 'testResult', errorRate: 0.1, provider: 'gpt', strategy: ['s1'] },
  { type: 'replay', niche: 'replay', errorRate: 0.5, provider: 'claude', strategy: ['s2'] },
  { type: 'source', niche: 'source', errorRate: 0.9, provider: 'gemini', strategy: ['s3'] },
];
assert.ok(B.effectiveDiversity(realDiverse) > 0.3);
assert.ok(!B.isMonoculture(realDiverse));

// ---- shouldRecruit ----

assert.ok(B.shouldRecruit(monoculture));
assert.ok(!B.shouldRecruit(realDiverse));

// ---- recommendNiche ----

assert.strictEqual(B.recommendNiche(monoculture), 'replay');
assert.strictEqual(B.recommendNiche(realDiverse), 'proof');

// ---- cognitiveBiocenose ----

const report = B.cognitiveBiocenose(realDiverse);
assert.ok(report.speciesRichness >= 3);
assert.ok(report.effectiveDiversity > 0);
assert.ok(!report.isMonoculture);
assert.ok(!report.shouldRecruit);

const monoReport = B.cognitiveBiocenose(monoculture);
assert.ok(monoReport.isMonoculture);
assert.ok(monoReport.shouldRecruit);
assert.strictEqual(monoReport.recommendNiche, 'replay');

console.log('OK epistemicBiocenoseService');
