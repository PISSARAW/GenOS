'use strict';

const assert = require('node:assert');
const V = require('../src/services/epistemic/verifierExecutionService');

// ---- création de receipt ----

const antigen = {
  id: 'ag-1',
  claim: 'X > 3',
  epitopes: {
    evidence: { kind: 'test_result', digest: 'sha256:abc' },
    assumptions: ['X is an integer'],
    validityDomain: { domain: 'math' },
  },
  producer: { model: 'test-model' },
};

const verifier = {
  type: 'testResult',
  strategy: ['isoler le test', 'reproduire', 'mesurer couverture'],
  affinity: 0.8,
};

// ---- executeVerifier ----

const result = V.executeVerifier(antigen, verifier, {});
assert.ok(result.status === 'verified' || result.status === 'refuted' || result.status === 'inconclusive');
assert.ok(result.receipt);
assert.ok(result.receipt.digest);
assert.strictEqual(result.resultId, 'ag-1');
assert.strictEqual(result.evidenceDigest, 'sha256:abc');
assert.strictEqual(result.verifierDigest, 'testResult');
assert.ok(result.executedAt);

// ---- executeVerifiers ----

const verifiers = [
  { type: 'testResult', strategy: ['reproduire'], affinity: 0.7 },
  { type: 'counterexample', strategy: ['chercher contre-exemple'], affinity: 0.6 },
];

// Un antigène sans digest permet au counterexample verifier de trouver un contre-exemple.
const weakAntigen = {
  id: 'ag-weak',
  claim: 'Y est vrai',
  epitopes: { evidence: { kind: 'observation' } },
  producer: { model: 'test-model' },
};
const results = V.executeVerifiers(weakAntigen, verifiers, {});
assert.strictEqual(results.status, 'refuted', 'counterexample verifier should refute weak antigen');
assert.strictEqual(results.results.length, 2);
assert.strictEqual(results.summary.refuted, 1);

// ---- pas de verifier ----

const noVerifier = V.executeVerifiers(antigen, [], {});
assert.strictEqual(noVerifier.status, 'no_verifier');

// ---- pas d'antigen ----

const noAntigen = V.executeVerifier(null, verifier, {});
assert.strictEqual(noAntigen.status, 'inconclusive');

console.log('OK verifierExecutionService');
