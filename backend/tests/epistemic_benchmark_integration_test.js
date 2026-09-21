'use strict';

const assert = require('node:assert');
const B = require('../src/services/epistemic/epistemicBenchmarkIntegrationService');

// ---- transformation cas de benchmark ----

const benchCase = {
  type: 'BFCL_SIMPLE',
  domain: 'python',
  question: 'Call the function get_weather with city=Paris',
  expectedAnswer: 'sunny',
  difficulty: 0.3,
};

const antigen = B.transformBenchmarkCase(benchCase);
assert.ok(antigen.id);
assert.strictEqual(antigen.type, 'BFCL_SIMPLE');
assert.strictEqual(antigen.claim.text, 'Call the function get_weather with city=Paris');
assert.strictEqual(antigen.benchmarkTruth, 'sunny');
assert.ok(antigen.dangerLevel > 0);

// ---- exécution cas de benchmark ----

const mockImmune = {
  recognize: (a) => a.dangerLevel >= 0.2,
  neutralize: (a) => a.dangerLevel >= 0.3,
  hasMemory: (a) => a.type === 'BFCL_SIMPLE',
};

const result = B.executeBenchmarkCase(antigen, mockImmune);
assert.ok(result.recognized);
assert.ok(result.neutralized);
assert.ok(result.memoryHit);
assert.strictEqual(result.truth, 'sunny');
assert.ok(typeof result.elapsedMs === 'number');

// ---- suite de benchmark ----

const cases = [
  { type: 'BFCL_SIMPLE', domain: 'python', question: 'q1', expectedAnswer: 'a1', difficulty: 0.3 },
  { type: 'BFCL_PARALLEL', domain: 'python', question: 'q2', expectedAnswer: 'a2', difficulty: 0.5 },
  { type: 'GAIA', domain: 'general', question: 'q3', expectedAnswer: 'a3', difficulty: 0.7 },
  { type: 'FPAMB', domain: 'math', question: 'q4', expectedAnswer: 'none', difficulty: 0.9 },
];

const metrics = B.runBenchmarkSuite(cases, mockImmune);
assert.ok(typeof metrics.far === 'number');
assert.ok(typeof metrics.recognitionRate === 'number');
assert.ok(typeof metrics.neutralizationRate === 'number');
assert.ok(typeof metrics.actualElapsedMs === 'number');
assert.ok(metrics.actualElapsedMs >= 0);

// ---- suite vide ----

const empty = B.runBenchmarkSuite([], mockImmune);
assert.strictEqual(empty.total, 0);

console.log('OK epistemicBenchmarkIntegrationService');
