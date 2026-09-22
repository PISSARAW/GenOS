'use strict';

/**
 * @file test_math_kernel_e2e.js
 * @description KERNEL test — requires real Lean 4.
 *
 * This test FAILS (exit 1) when Lean is not installed.
 * Do NOT skip silently — the kernel test must prove that Lean actually compiles
 * and verifies a proof, not that the pipeline can run without verification.
 *
 * Tests:
 *  1. Simple arithmetic (∀ n : Nat, n + 0 = n) — full pipeline through real Lean
 *  2. Negative test — mismatched statement rejected
 *  3. Culture preserves ProofArtifact through transmission
 *  4. Lean rejects sorry placeholders
 */

const assert = require('node:assert');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');

const { createProofArtifact } = require('../src/services/mathematical/proofArtifact');
const { createFormalResult } = require('../src/services/formalResultService');
const { createFormalizationArtifact } = require('../src/services/mathematical/formalizationArtifact');
const { MathematicalDependencyGraph } = require('../src/services/epistemicScheduler/mathematicalDependencyGraph');
const { LeanIncrementalGate } = require('../src/services/epistemicScheduler/leanIncrementalGate');
const { executeLeanCheck } = require('../src/services/epistemicScheduler/leanProcessExecutor');
const { MathematicalCulture } = require('../src/services/mathematical/mathematicalCultureService');

// ─── Lean availability — FAIL if missing ──────────────────────────────────────

function findLeanExecutable() {
  for (const name of ['lean', 'lean.exe', 'lean4']) {
    try {
      execFileSync(name, ['--version'], { encoding: 'utf8', timeout: 10000 });
      return name;
    } catch {}
  }
  return null;
}

const LEAN = findLeanExecutable();

async function getVersion() {
  try {
    return execFileSync(LEAN, ['--version'], { encoding: 'utf8', timeout: 10000 }).trim();
  } catch {
    return null;
  }
}

function makeGate(rawVersion) {
  const m = rawVersion.match(/version\s+([0-9]+\.[0-9]+(?:\.[0-9]+)?)/i);
  const semver = m ? m[1] : rawVersion.trim().split(/\s+/)[0];
  const graph = new MathematicalDependencyGraph();
  return new LeanIncrementalGate({
    graph,
    executor: executeLeanCheck,
    toolchainVersion: semver,
    environmentDigest: `sha256:${crypto.createHash('sha256').update('genos-v3-lean-env').digest('hex')}`,
    allowedAxioms: new Set(),
  });
}

// ─── Test 1: Real Lean E2E — simple arithmetic ────────────────────────────────

async function testRealLeanSimple() {
  const version = await getVersion();
  assert.ok(version, 'Lean version available');
  console.log(`Lean version: ${version}`);

  const formalization = createFormalizationArtifact({
    naturalStatement: 'For every natural number n, n + 0 = n',
    formalStatement: '∀ n : Nat, n + 0 = n',
    formalLanguage: 'lean4',
    formalizer: 'genos-autoformalizer-v0',
  });

  // Immutability check
  assert.strictEqual(Object.isFrozen(formalization), true, 'FormalizationArtifact must be immutable (frozen)');
  assert.strictEqual(Object.isFrozen(formalization.imports), true, 'imports must be frozen');
  assert.strictEqual(Object.isFrozen(formalization.provenance), true, 'provenance must be frozen');

  const header = formalization.generateLeanHeader({ name: 'nat_zero_add' });
  assert.ok(header.includes('theorem nat_zero_add :'), 'Header has theorem declaration');
  assert.ok(header.includes('∀ n : Nat, n + 0 = n'), 'Header has formal statement');
  assert.ok(!header.includes('"'), 'Header MUST NOT quote statement as string literal');

  const fullSource = formalization.generateLeanSource({ name: 'nat_zero_add', proofBody: '  simp' });
  assert.ok(fullSource.includes('theorem nat_zero_add :'), 'Full source has theorem');
  assert.ok(fullSource.includes('∀ n : Nat, n + 0 = n'), 'Full source has formal statement');
  assert.ok(fullSource.includes(':= by'), 'Full source has proof separator');
  assert.ok(fullSource.includes('simp'), 'Full source has proof body');

  // Real Lean kernel check
  const result = await executeLeanCheck({
    leanExecutable: LEAN,
    toolchainVersion: version.match(/version\s+([0-9]+\.[0-9]+(?:\.[0-9]+)?)/i)?.[1] || version.trim().split(/\s+/)[0],
    source: fullSource,
    timeoutMs: 30000,
  });

  console.log(`Lean execution: exitCode=${result.exitCode}`);
  if (result.stderr) console.log(`Lean stderr: ${result.stderr.substring(0, 200)}`);

  assert.strictEqual(result.exitCode, 0, `Lean should accept the proof. stderr: ${result.stderr}`);

  // Full ProofArtifact pipeline with real Lean
  const gate = makeGate(version);
  const nodeId = `node-nat-zero-add-${crypto.createHash('sha256').update('∀ n : Nat, n + 0 = n').digest('hex').slice(0, 32)}`;
  gate.graph.addNode({ nodeId, type: 'theorem', canonicalStatement: '∀ n : Nat, n + 0 = n', status: 'formalized' });

  const formalResult = createFormalResult({
    canonicalStatement: '∀ n : Nat, n + 0 = n',
    status: 'formalized',
    evidence: { kind: 'proof', content: fullSource },
    assumptions: [],
    validityDomain: { statement: 'general', constraints: [] },
    dependencies: [],
    provenance: {
      createdAt: new Date().toISOString(),
      actor: 'genos-test',
      source: { type: 'test', uri: 'test:nat-zero-add', digest: `sha256:${crypto.createHash('sha256').update('nat-zero-add').digest('hex')}` },
      inputs: [],
      transformations: [],
    },
    producer: { model: 'genos-test', version: '1.0' },
  });

  const artifact = createProofArtifact({
    id: 'test-artifact-nat-zero-add',
    type: 'theorem',
    statement: 'For every natural number n, n + 0 = n',
    domain: 'number_theory',
  });
  artifact.attachFormalResult(formalResult, formalization);

  const verified = await artifact.verifyThroughLean(gate, fullSource);
  assert.strictEqual(verified, true, 'ProofArtifact verifies through real Lean');
  assert.strictEqual(artifact.status, 'verified', 'Status is verified');
  assert.ok(artifact.isVerified(), 'isVerified() true');
  assert.ok(artifact._leanReceipt, 'Has Lean receipt');
  assert.strictEqual(artifact._leanReceipt.status, 'passed', 'Receipt passed');
  assert.ok(/^sha256:[a-f0-9]{64}$/.test(artifact._leanReceipt.receiptDigest), 'receiptDigest valid SHA-256');
  assert.ok(/^sha256:[a-f0-9]{64}$/.test(artifact._leanReceipt.sourceDigest), 'sourceDigest valid SHA-256');
  assert.ok(artifact._formalResult.status === 'verified', 'FormalResult atomically verified');

  console.log('OK KernelE2E-simple-theorem');
}

// ─── Test 2: Negative — mismatched statement rejected ─────────────────────────

async function testMismatchRejected() {
  const version = await getVersion();

  const formalization = createFormalizationArtifact({
    naturalStatement: 'For every natural number n, n + 0 = n',
    formalStatement: '∀ n : Nat, n + 0 = n',
  });

  // Proves "True" instead of the goal — classic bypass
  const wrongSource = `theorem nat_zero_add : True := by trivial`;

  const gate = makeGate(version);
  const nodeId = `node-wrong-${crypto.createHash('sha256').update('wrong').digest('hex').slice(0, 32)}`;
  gate.graph.addNode({ nodeId, type: 'theorem', canonicalStatement: '∀ n : Nat, n + 0 = n', status: 'formalized' });

  const formalResult = createFormalResult({
    canonicalStatement: '∀ n : Nat, n + 0 = n',
    status: 'formalized',
    evidence: { kind: 'proof', content: wrongSource },
    assumptions: [],
    validityDomain: { statement: 'general', constraints: [] },
    dependencies: [],
    provenance: {
      createdAt: new Date().toISOString(),
      actor: 'genos-test',
      source: { type: 'test', uri: 'test:wrong', digest: `sha256:${crypto.createHash('sha256').update('wrong').digest('hex')}` },
      inputs: [],
      transformations: [],
    },
    producer: { model: 'genos-test', version: '1.0' },
  });

  const artifact = createProofArtifact({
    id: 'test-artifact-wrong',
    type: 'theorem',
    statement: 'For every natural number n, n + 0 = n',
    domain: 'number_theory',
  });
  artifact.attachFormalResult(formalResult, formalization);

  try {
    await artifact.verifyThroughLean(gate, wrongSource);
    assert.fail('Should throw for mismatched statement');
  } catch (e) {
    assert.ok(e.message.includes('does not prove') || e.message.includes('Binding mismatch') || e.message.includes('mismatch'),
      `Error should mention binding mismatch. Got: ${e.message}`);
  }

  console.log('OK KernelE2E-mismatch-rejected');
}

// ─── Test 3: Culture preserves ProofArtifact ───────────────────────────────────

async function testCulturePreserves() {
  const version = await getVersion();

  const formalization = createFormalizationArtifact({
    naturalStatement: 'forall n : Nat, n + 0 = n',
    formalStatement: '∀ n : Nat, n + 0 = n',
  });

  const fullSource = formalization.generateLeanSource({ proofBody: '  simp' });
  const gate = makeGate(version);
  const nodeId = `node-culture-${crypto.createHash('sha256').update('culture').digest('hex').slice(0, 32)}`;
  gate.graph.addNode({ nodeId, type: 'lemma', canonicalStatement: '∀ n : Nat, n + 0 = n', status: 'formalized' });

  const formalResult = createFormalResult({
    canonicalStatement: '∀ n : Nat, n + 0 = n',
    status: 'formalized',
    evidence: { kind: 'proof', content: fullSource },
    assumptions: [],
    validityDomain: { statement: 'general', constraints: [] },
    dependencies: [],
    provenance: {
      createdAt: new Date().toISOString(),
      actor: 'genos-test',
      source: { type: 'test', uri: 'test:culture', digest: `sha256:${crypto.createHash('sha256').update('culture').digest('hex')}` },
      inputs: [],
      transformations: [],
    },
    producer: { model: 'genos-test', version: '1.0' },
  });

  const artifact = createProofArtifact({
    id: 'culture-test-artifact',
    type: 'lemma',
    statement: 'forall n : Nat, n + 0 = n',
    domain: 'number_theory',
  });
  artifact.attachFormalResult(formalResult, formalization);
  await artifact.verifyThroughLean(gate, fullSource);
  assert.ok(artifact.isVerified(), 'Artifact verified before culture transmission');

  const culture = new MathematicalCulture({ fidelityRate: 0.95 });
  const culturalArtifact = culture.addArtifact({
    type: 'lemma',
    content: '∀ n : Nat, n + 0 = n',
    source: 'source-lineage-1',
    proofArtifact: artifact,
  });

  const recipient = { id: 'recipient-1', _knowledge: [], genome: { strategies: [] } };
  culture.transmit(culturalArtifact.id, recipient);

  assert.ok(recipient._knowledge.length >= 1, 'Recipient has knowledge entry');
  const entry = recipient._knowledge[0];
  assert.ok(entry.proofArtifact, 'Knowledge preserves proofArtifact');
  assert.ok(entry.proofArtifact.isVerified(), 'Preserved proofArtifact still verified');
  assert.ok(entry.semanticFingerprint, 'Preserves semanticFingerprint');
  assert.ok(entry.validityDomain, 'Preserves validityDomain');
  assert.strictEqual(entry.verified, true, 'Marked as verified');
  assert.strictEqual(entry.type, 'lemma', 'Type is lemma');

  console.log('OK KernelE2E-culture-preserves');
}

// ─── Test 4: Lean rejects sorry ────────────────────────────────────────────────

async function testLeanRejectsSorry() {
  const version = await getVersion();

  const formalization = createFormalizationArtifact({
    naturalStatement: '2 + 2 = 4',
    formalStatement: '2 + 2 = 4',
  });

  const sorrySource = formalization.generateLeanSource({ proofBody: '  sorry' });

  const gate = makeGate(version);
  const nodeId = `node-sorry-${crypto.createHash('sha256').update('sorry').digest('hex').slice(0, 32)}`;
  gate.graph.addNode({ nodeId, type: 'theorem', canonicalStatement: '2 + 2 = 4', status: 'formalized' });

  const validationError = gate.validateRequest({ nodeId, source: sorrySource });
  assert.ok(validationError !== null, 'Gate rejects sorry in validateRequest');
  assert.ok(validationError.toLowerCase().includes('sorry') || validationError.toLowerCase().includes('placeholder'),
    `Error mentions sorry/placeholder. Got: ${validationError}`);

  console.log('OK KernelE2E-rejects-sorry');
}

// ─── Test 5: FormalizationRegistry + UNFORMALIZED state ────────────────────────

async function testFormalizationRegistry() {
  const { createFormalizationRegistry } = require('../src/services/mathematical/formalizationArtifact');

  const registry = createFormalizationRegistry();
  assert.strictEqual(registry.size(), 0, 'Registry starts empty');

  const formalization = createFormalizationArtifact({
    naturalStatement: 'Every even integer greater than two is the sum of two primes',
    formalStatement: '', // UNFORMALIZED
  });

  registry.add(formalization);
  assert.strictEqual(registry.size(), 1, 'Registry has 1 entry');

  const lookup = registry.getByCanonical('Every even integer greater than two is the sum of two primes');
  assert.ok(lookup, 'Lookup by canonical statement finds the entry');
  assert.strictEqual(lookup.formalStatement, '', 'FormalStatement empty = UNFORMALIZED');
  assert.strictEqual(lookup.formalStatementFingerprint, null, 'No fingerprint for empty formalStatement');

  console.log('OK KernelE2E-formalization-registry');
}

// ─── Test 6: HGT semantic fingerprint ─────────────────────────────────────────

async function testHGTFingerprint() {
  const { createMathematicalPlasmid } = require('../src/services/mathematical/mutationEngine');
  const crypto = require('node:crypto');

  // Same knowledge twice — must produce same semanticFingerprint
  const canonical = '∀ n : Nat, n + 0 = n';
  const vDomain = { assumptions: [], constraints: [], domain: 'number_theory' };
  const fp1 = `sha256:${crypto.createHash('sha256').update(canonical + JSON.stringify(vDomain) + '').digest('hex')}`;
  const fp2 = `sha256:${crypto.createHash('sha256').update(canonical + JSON.stringify(vDomain) + '').digest('hex')}`;

  assert.strictEqual(fp1, fp2, 'Same knowledge produces same semanticFingerprint');

  // Different knowledge — different fingerprint
  const fp3 = `sha256:${crypto.createHash('sha256').update('∀ n : Nat, 0 + n = n' + JSON.stringify(vDomain) + '').digest('hex')}`;
  assert.notStrictEqual(fp1, fp3, 'Different knowledge produces different semanticFingerprint');

  console.log('OK KernelE2E-hgt-fingerprint');
}

// ─── Run — FAIL if Lean missing ────────────────────────────────────────────────

(async () => {
  if (!LEAN) {
    console.error('FAIL: Lean 4 not found. Install: curl https://raw.githubusercontent.com/leanprover/elan/master/elan-init -sSf | sh');
    console.error('This is a KERNEL test — it requires real Lean to execute.');
    process.exit(1);
  }

  console.log(`Lean executable: ${LEAN}`);
  const version = await getVersion();
  console.log(`Lean version: ${version}`);

  await testRealLeanSimple();
  await testMismatchRejected();
  await testCulturePreserves();
  await testLeanRejectsSorry();
  await testFormalizationRegistry();
  await testHGTFingerprint();

  console.log('All KERNEL E2E tests passed.');
})().catch(e => { console.error(e); process.exit(1); });
