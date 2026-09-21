'use strict';

const assert = require('node:assert');
const { createProofArtifact } = require('../src/services/mathematical/proofArtifact');
const { createFormalResult } = require('../src/services/formalResultService');
const { MathematicalDependencyGraph } = require('../src/services/epistemicScheduler/mathematicalDependencyGraph');
const { LeanIncrementalGate } = require('../src/services/epistemicScheduler/leanIncrementalGate');

// Test 1: Cannot create verified artifact without proof
const art1 = createProofArtifact({
  type: 'lemma',
  statement: 'Every even n > 2 is the sum of two primes',
  domain: 'number_theory',
});
assert.strictEqual(art1.status, 'conjecture');
assert.strictEqual(art1.isVerified(), false);

// Test 2: attachFormalResult with valid proof evidence
const formalResult = createFormalResult({
  canonicalStatement: 'Every even n > 2 is the sum of two primes',
  status: 'formalized',
  evidence: { kind: 'proof', content: 'proof body here' },
  assumptions: [{ id: 'n_even', statement: 'n is even' }],
  validityDomain: { statement: 'n > 2', constraints: ['n > 2'] },
  dependencies: [],
  provenance: {
    createdAt: new Date().toISOString(),
    actor: 'test',
    source: { type: 'test', uri: 'test', digest: 'sha256:0000000000000000000000000000000000000000000000000000000000000000' },
    inputs: [],
    transformations: [],
  },
  producer: { model: 'test', version: '1.0' },
});

assert.strictEqual(formalResult.status, 'formalized');
art1.attachFormalResult(formalResult);
assert.strictEqual(art1.receipt.resultId, formalResult.resultId);

// Test 3: LeanIncrementalGate rejects placeholder proofs
const graph = new MathematicalDependencyGraph();
graph.addNode({
  nodeId: 'test-lemma-1',
  type: 'lemma',
  canonicalStatement: 'forall n : Nat, n >= 0',
  status: 'formalized',
});

const gate = new LeanIncrementalGate({
  graph,
  executor: async () => ({ exitCode: 0, toolchainVersion: 'lean-4.9.0', sourceDigest: 'sha256:0000000000000000000000000000000000000000000000000000000000000000', axioms: [] }),
  toolchainVersion: 'lean-4.9.0',
  environmentDigest: 'sha256:0000000000000000000000000000000000000000000000000000000000000000',
});

const validationError = gate.validateRequest({
  nodeId: 'test-lemma-1',
  source: 'begin sorry end',
});
assert.ok(validationError !== null, 'Placeholder proofs must be rejected');

// Test 4: Summary shows not verified (no Lean receipt)
const s = art1.summary();
assert.ok(s.verified === false);

console.log('OK ProofArtifact (no fake receipts)');
