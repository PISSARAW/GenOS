'use strict';

/**
 * @file test_math_structural_b_e2e.js
 * @description STRUCTURAL test Part B — HGT, AEIS gate, UNFORMALIZED, forged rejection, isVerified.
 * Uses mock Lean. Validates:
 *  - HGT duplicate detection by semantic fingerprint
 *  - AEIS gate behavior for knowledge vs strategy vs lemma
 *  - FormalizationArtifact UNFORMALIZED state
 *  - Culture rejects forged verified without ProofArtifact
 *  - ProofArtifact.isVerified requires real receipt
 */

const assert = require('node:assert');
const crypto = require('node:crypto');

const { createFormalizationArtifact } = require('../src/services/mathematical/formalizationArtifact');
const { createProofArtifact } = require('../src/services/mathematical/proofArtifact');
const { MathematicalCulture } = require('../src/services/mathematical/mathematicalCultureService');
const { MutationEngine, createMathematicalPlasmid, aeisGate } = require('../src/services/mathematical/mutationEngine');

function sha256(value) {
  return `sha256:${crypto.createHash('sha256').update(value).digest('hex')}`;
}

function testHGTDeduplication() {
  const engine = new MutationEngine({ hgtRate: 1.0 });

  const source = {
    id: 'source-1',
    fitness: { P: 0.5, N: 0.5, I: 0.5, A: 0.5, T: 0.5, R: 0.5, C: 1 },
    genome: { strategies: [] }, _knowledge: [], generation: 0,
  };

  const canonicalStmt = '∀ n : Nat, n + 0 = n';
  const proofArtifact = {
    type: 'theorem', statement: 'forall n : Nat, n + 0 = n', domain: 'number_theory',
    _leanReceipt: { status: 'passed', sourceDigest: sha256('source'), receiptDigest: sha256('receipt'), environmentDigest: sha256('env') },
    _formalResult: {
      canonicalStatement: canonicalStmt, status: 'verified',
      semanticFingerprint: sha256('pre-existing-fp'), assumptions: [],
      validityDomain: { statement: 'general', constraints: [] },
      provenance: { transformations: [] },
    },
    isVerified() { return this.status === 'verified'; }, status: 'verified',
  };

  const vDomain = proofArtifact._formalResult.validityDomain;
  const assumptions = proofArtifact._formalResult.assumptions;
  const fp = `sha256:${crypto.createHash('sha256').update(canonicalStmt + JSON.stringify(vDomain) + assumptions.join(',')).digest('hex')}`;

  const target1 = {
    id: 'target-1',
    fitness: { P: 0.5, N: 0.5, I: 0.5, A: 0.5, T: 0.5, R: 0.5, C: 1 },
    genome: { strategies: [] }, _knowledge: [], _assimilatedPlasmids: [],
  };

  const result1 = engine.horizontalGeneTransfer(source, target1, proofArtifact, { blocked: false });
  assert.ok(result1, 'First HGT succeeds');
  assert.strictEqual(result1.immunePassed, true, 'Immune passed');
  assert.ok(target1._knowledge.length >= 1, 'Knowledge transferred');
  assert.strictEqual(target1._knowledge[0].semanticFingerprint, fp, 'Fingerprint stored correctly');

  // Second transfer: should be deduplicated
  const result2 = engine.horizontalGeneTransfer(source, target1, proofArtifact, { blocked: false });
  assert.strictEqual(target1._knowledge.length, 1, 'Same knowledge not duplicated');

  console.log('OK StructuralHGTDeduplication');
}

function testAEISGateKnowledgeReceipt() {
  const source = { fitness: { P: 0.5 } };
  const target = { fitness: { P: 0.5 }, genome: { strategies: [] } };

  // Knowledge without receipt → blocked
  const r1 = aeisGate(source, target, createMathematicalPlasmid({
    type: 'knowledge', capability: 'theorem', proofReceipt: null, compatibility: { requiredFitness: 0.1 },
  }));
  assert.strictEqual(r1.blocked, true, 'Knowledge without receipt blocked');
  assert.strictEqual(r1.reason, 'lemma_requires_proof_receipt', 'Reason: receipt required');

  // Knowledge with receipt → passes
  const r2 = aeisGate(source, target, createMathematicalPlasmid({
    type: 'knowledge', capability: 'theorem',
    proofReceipt: { status: 'passed', receiptDigest: sha256('receipt') },
    compatibility: { requiredFitness: 0.1 },
  }));
  assert.strictEqual(r2.blocked, false, 'Knowledge with receipt passes');

  // Lemma without receipt → blocked
  const r3 = aeisGate(source, target, createMathematicalPlasmid({
    type: 'lemma', capability: 'lemma', proofReceipt: null, compatibility: { requiredFitness: 0.1 },
  }));
  assert.strictEqual(r3.blocked, true, 'Lemma without receipt blocked');

  // Strategy without receipt → passes (unverified cultural trait)
  const r4 = aeisGate(source, target, createMathematicalPlasmid({
    type: 'strategy', capability: 'simp', proofReceipt: null, compatibility: { requiredFitness: 0.1 },
  }));
  assert.strictEqual(r4.blocked, false, 'Strategy without receipt passes');

  console.log('OK StructuralAEISGate');
}

function testUnformalizedState() {
  const f = createFormalizationArtifact({
    naturalStatement: 'Every even integer greater than two is the sum of two primes',
    formalStatement: '', formalizer: null,
  });

  assert.strictEqual(f.formalStatement, '', 'Formal statement empty = UNFORMALIZED');
  assert.strictEqual(f.formalStatementFingerprint, null, 'No fingerprint for empty formalStatement');
  assert.strictEqual(f.formalizer, null, 'No formalizer');
  assert.ok(f.naturalStatementFingerprint, 'Natural statement has fingerprint');

  console.log('OK StructuralUnformalizedState');
}

function testForgedVerificationRejected() {
  const culture = new MathematicalCulture();

  try {
    culture.addArtifact({ type: 'theorem', content: 'forged_theorem', verified: true });
    assert.fail('Should throw');
  } catch (e) {
    assert.ok(e.message.includes('Forged verified is forbidden'), 'Forge rejected');
  }

  const unverified = culture.addArtifact({ type: 'heuristic', content: 'heuristic_1', verified: false });
  assert.ok(unverified, 'Unverified accepted');

  console.log('OK StructuralForgedRejected');
}

function testIsVerifiedRequiresReceipt() {
  const artifact = createProofArtifact({ type: 'theorem', statement: 'test' });

  assert.strictEqual(artifact.isVerified(), false, 'Default not verified');

  artifact.status = 'verified';
  assert.strictEqual(artifact.isVerified(), false, 'Status verified but no receipt → not verified');

  artifact._leanReceipt = { status: 'passed', sourceDigest: sha256('test'), receiptDigest: sha256('receipt'), environmentDigest: sha256('env') };
  artifact._formalResult = { status: 'verified', evidence: { kind: 'proof' } };
  assert.strictEqual(artifact.isVerified(), true, 'All conditions met → verified');

  console.log('OK StructuralIsVerifiedReceipt');
}

(async () => {
  console.log('Running STRUCTURAL E2E tests Part B...');
  testHGTDeduplication();
  testAEISGateKnowledgeReceipt();
  testUnformalizedState();
  testForgedVerificationRejected();
  testIsVerifiedRequiresReceipt();
  console.log('All STRUCTURAL Part B tests passed.');
})().catch(e => { console.error(e); process.exit(1); });
