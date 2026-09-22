'use strict';

/**
 * @file test_math_structural_a_e2e.js
 * @description STRUCTURAL test Part A — formalization, proof pipeline, culture.
 * Uses mock Lean. Validates:
 *  - FormalizationArtifact immutability
 *  - FormalizationRegistry lookup (UNFORMALIZED state)
 *  - Binding authority (header + source generation)
 *  - ProofArtifact with mock Lean
 *  - Culture transmission preserves ProofArtifact + fingerprints
 */

const assert = require('node:assert');
const crypto = require('node:crypto');

const { createFormalizationArtifact, createFormalizationRegistry } = require('../src/services/mathematical/formalizationArtifact');
const { createProofArtifact } = require('../src/services/mathematical/proofArtifact');
const { createFormalResult } = require('../src/services/formalResultService');
const { MathematicalCulture } = require('../src/services/mathematical/mathematicalCultureService');
const { MathematicalDependencyGraph } = require('../src/services/epistemicScheduler/mathematicalDependencyGraph');
const { LeanIncrementalGate } = require('../src/services/epistemicScheduler/leanIncrementalGate');

function makeMockExecutor() {
  return async ({ source }) => {
    if (/\b(sorry|admit)\b/.test(source)) {
      return { exitCode: 1, stderr: 'placeholder', toolchainVersion: 'mock-4.9.0', axioms: [] };
    }
    return { exitCode: 0, stderr: '', toolchainVersion: 'mock-4.9.0', axioms: [] };
  };
}

function makeMockGate() {
  const graph = new MathematicalDependencyGraph();
  return new LeanIncrementalGate({
    graph, executor: makeMockExecutor(),
    toolchainVersion: 'mock-4.9.0',
    environmentDigest: `sha256:${crypto.createHash('sha256').update('mock-env').digest('hex')}`,
    allowedAxioms: new Set(),
  });
}

function sha256(value) {
  return `sha256:${crypto.createHash('sha256').update(value).digest('hex')}`;
}

function testFormalizationImmutability() {
  const f = createFormalizationArtifact({
    naturalStatement: 'For every natural number n, n + 0 = n',
    formalStatement: '∀ n : Nat, n + 0 = n',
    imports: ['Nat', 'Mathlib'],
    provenance: { actor: 'test' },
  });

  assert.strictEqual(Object.isFrozen(f), true, 'Artifact is frozen');
  assert.strictEqual(Object.isFrozen(f.imports), true, 'imports is frozen');
  assert.strictEqual(Object.isFrozen(f.provenance), true, 'provenance is frozen');

  try { f.formalStatement = 'False'; } catch (e) {}
  assert.strictEqual(f.formalStatement, '∀ n : Nat, n + 0 = n', 'formalStatement unchanged after mutation attempt');

  console.log('OK StructuralFormalizationImmutability');
}

function testFormalizationRegistry() {
  const registry = createFormalizationRegistry();
  assert.strictEqual(registry.size(), 0, 'Empty registry');

  registry.add(createFormalizationArtifact({
    naturalStatement: 'Goldbach conjecture',
    formalStatement: '',
  }));
  registry.add(createFormalizationArtifact({
    naturalStatement: 'For every natural number n, n + 0 = n',
    formalStatement: '∀ n : Nat, n + 0 = n',
  }));

  assert.strictEqual(registry.size(), 2, 'Registry has 2 entries');

  const lookup = registry.getByCanonical('For every natural number n, n + 0 = n');
  assert.ok(lookup, 'Found by canonical statement');
  assert.strictEqual(lookup.formalStatement, '∀ n : Nat, n + 0 = n', 'Correct formalization retrieved');

  const lookupU = registry.getByCanonical('Goldbach conjecture');
  assert.strictEqual(lookupU.formalStatement, '', 'UNFORMALIZED: formalStatement empty');
  assert.strictEqual(lookupU.formalizer, null, 'UNFORMALIZED: formalizer null');

  assert.strictEqual(registry.getByCanonical('Unknown statement'), null, 'Unknown returns null');

  console.log('OK StructuralFormalizationRegistry');
}

function testBindingAuthority() {
  const f = createFormalizationArtifact({
    naturalStatement: 'n + 0 = n',
    formalStatement: '∀ n : Nat, n + 0 = n',
  });

  const header = f.generateLeanHeader({ name: 'my_theorem' });
  assert.ok(header.includes('theorem my_theorem :'), 'Header format correct');
  assert.ok(header.includes('∀ n : Nat, n + 0 = n'), 'Header contains formal statement');
  assert.ok(!header.includes('"'), 'Header does NOT quote the statement');

  const source = f.generateLeanSource({ name: 'my_theorem', proofBody: '  simp' });
  assert.ok(source.includes('theorem my_theorem :'), 'Source has header');
  assert.ok(source.includes('∀ n : Nat, n + 0 = n'), 'Source has statement');
  assert.ok(source.includes(':= by'), 'Source has proof separator');
  assert.ok(source.includes('simp'), 'Source has proof body');

  console.log('OK StructuralBindingAuthority');
}

async function testProofArtifactWithMockLean() {
  const gate = makeMockGate();
  const nodeId = `node-mock-${crypto.randomBytes(4).toString('hex')}`;
  gate.graph.addNode({ nodeId, type: 'theorem', canonicalStatement: '∀ n : Nat, n + 0 = n', status: 'formalized' });

  const formalization = createFormalizationArtifact({
    naturalStatement: 'For every natural number n, n + 0 = n',
    formalStatement: '∀ n : Nat, n + 0 = n',
  });
  const source = formalization.generateLeanSource({ proofBody: '  simp' });

  const formalResult = createFormalResult({
    canonicalStatement: '∀ n : Nat, n + 0 = n',
    status: 'formalized',
    evidence: { kind: 'proof', content: source },
    assumptions: [],
    validityDomain: { statement: 'general', constraints: [] },
    dependencies: [],
    provenance: {
      createdAt: new Date().toISOString(), actor: 'genos-test',
      source: { type: 'test', uri: 'test:mock', digest: sha256('mock') },
      inputs: [], transformations: [],
    },
    producer: { model: 'genos-mock', version: '1.0' },
  });

  const artifact = createProofArtifact({
    id: 'mock-artifact-1', type: 'theorem',
    statement: 'For every natural number n, n + 0 = n', domain: 'number_theory',
  });
  artifact.attachFormalResult(formalResult, formalization);

  assert.ok(artifact._formalizationFp, '_formalizationFp is set');
  assert.strictEqual(
    artifact._formalizationFp, formalization.formalStatementFingerprint,
    '_formalizationFp matches formalStatementFingerprint'
  );

  const verified = await artifact.verifyThroughLean(gate, source);
  assert.strictEqual(verified, true, 'Mock verification passes');
  assert.ok(artifact.isVerified(), 'isVerified() true');
  assert.strictEqual(artifact.status, 'verified', 'Status verified');
  assert.strictEqual(artifact._leanReceipt.status, 'passed', 'Receipt passed');

  console.log('OK StructuralProofArtifactMock');
}

function testCultureTransmission() {
  const formalization = createFormalizationArtifact({
    naturalStatement: 'forall n : Nat, n + 0 = n',
    formalStatement: '∀ n : Nat, n + 0 = n',
  });
  const source = formalization.generateLeanSource({ proofBody: '  simp' });

  const formalResult = createFormalResult({
    canonicalStatement: '∀ n : Nat, n + 0 = n',
    status: 'formalized',
    evidence: { kind: 'proof', content: source },
    assumptions: [],
    validityDomain: { statement: 'general', constraints: [] },
    dependencies: [],
    provenance: {
      createdAt: new Date().toISOString(), actor: 'genos-test',
      source: { type: 'test', uri: 'test:culture-struct', digest: sha256('culture') },
      inputs: [], transformations: [],
    },
    producer: { model: 'genos-test', version: '1.0' },
  });

  const artifact = createProofArtifact({
    id: 'culture-struct-artifact', type: 'lemma',
    statement: 'forall n : Nat, n + 0 = n', domain: 'number_theory',
  });
  artifact.attachFormalResult(formalResult, formalization);

  // Mock verification
  artifact._leanReceipt = {
    status: 'passed', sourceDigest: sha256(source),
    receiptDigest: sha256('culture-receipt'), environmentDigest: sha256('mock-env'),
  };
  artifact.status = 'verified';
  artifact._formalResult.status = 'verified';
  artifact._formalResult.evidence = { kind: 'proof', content: source };

  const culture = new MathematicalCulture({ fidelityRate: 0.95 });

  // Forged verification is forbidden
  try {
    culture.addArtifact({ type: 'lemma', content: 'forged', verified: true });
    assert.fail('Should throw for forged verified');
  } catch (e) {
    assert.ok(e.message.includes('Forged verified is forbidden'), 'Forge rejected');
  }

  const culturalArtifact = culture.addArtifact({
    type: 'lemma', content: '∀ n : Nat, n + 0 = n',
    source: 'source-lineage', proofArtifact: artifact,
  });

  const recipient = { id: 'recipient-struct', _knowledge: [], genome: { strategies: [] } };
  culture.transmit(culturalArtifact.id, recipient);

  assert.ok(recipient._knowledge.length >= 1, 'Recipient got knowledge');
  const entry = recipient._knowledge[0];
  assert.ok(entry.proofArtifact, 'Knowledge preserves proofArtifact');
  assert.ok(entry.proofArtifact.isVerified(), 'Preserved proofArtifact verified');
  assert.ok(entry.semanticFingerprint, 'Preserves semanticFingerprint');
  assert.ok(entry.validityDomain, 'Preserves validityDomain');

  console.log('OK StructuralCultureTransmission');
}

(async () => {
  console.log('Running STRUCTURAL E2E tests Part A...');
  testFormalizationImmutability();
  testFormalizationRegistry();
  testBindingAuthority();
  await testProofArtifactWithMockLean();
  testCultureTransmission();
  console.log('All STRUCTURAL Part A tests passed.');
})().catch(e => { console.error(e); process.exit(1); });
