'use strict';

const assert = require('node:assert');
const C = require('../src/services/epistemic/epistemicChallengeService');

// ---- pathogènes connus ----

assert.ok(Array.isArray(C.PHOGENS));
assert.strictEqual(C.PHOGENS.length, 10);
assert.ok(C.PHOGENS.includes('P01_FAKE_EVIDENCE'));
assert.ok(C.PHOGENS.includes('P10_CORRELATED_MODEL_FAILURE'));

// ---- création pathogène ----

const p = C.createPathogen('P01_FAKE_EVIDENCE', { domain: 'auth', dangerLevel: 0.9 });
assert.ok(p.id);
assert.strictEqual(p.type, 'P01_FAKE_EVIDENCE');
assert.strictEqual(p.domain, 'auth');
assert.strictEqual(p.dangerLevel, 0.9);

// ---- suite de challenge ----

const suite = C.buildChallengeSuite({ domain: 'auth' });
assert.strictEqual(suite.count, 10);
assert.strictEqual(suite.type, 'epistemic_pathogen_challenge');

// ---- run challenge avec un mock d'immune system ----

const mockImmune = {
  recognize: (p) => p.dangerLevel >= 0.4,
  neutralize: (p) => p.dangerLevel >= 0.5,
  hasMemory: (p) => p.type === 'P01_FAKE_EVIDENCE',
};

const results = C.runChallenge(suite.suite, mockImmune);
assert.strictEqual(results.length, 10);

// ---- challenge report ----

const report = C.challengeReport(suite.suite, results);
assert.strictEqual(report.total, 10);
assert.ok(report.recognized > 0);
assert.ok(report.neutralized > 0);
assert.ok(typeof report.recognitionRate === 'number');
assert.ok(typeof report.neutralizationRate === 'number');
assert.ok(typeof report.memoryResponseGain === 'number');

// ---- challenge metrics ----

const metrics = C.challengeMetrics(report);
assert.ok(typeof metrics.far === 'number');
assert.ok(typeof metrics.recognitionRate === 'number');
assert.ok(typeof metrics.responseCost === 'number');
assert.ok(typeof metrics.responseLatency === 'number');

console.log('OK epistemicChallengeService');
