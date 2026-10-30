'use strict';

const assert = require('node:assert/strict');
const { MathematicalDependencyGraph, LeanIncrementalGate } = require('../src/services/epistemicScheduler');
const { VerificationRegistry } = require('../src/services/mathematical/verificationRegistry');
const { sourceTarget } = require('../src/services/epistemicScheduler/leanSourceContract');
const { verifyLeanCandidate } = require('../src/services/leanVerificationService');
const { leanProcessEnvironment } = require('../src/services/epistemicScheduler/leanEnvironment');
const { FormalizationArtifact, formalStatementFingerprint } = require('../src/services/mathematical/formalizationArtifact');
const { evidenceScore } = require('../src/services/agentEvidenceService');

const toolchainVersion = 'trusted-test-executor';
const environmentDigest = `sha256:${'e'.repeat(64)}`;

function setup(execution) {
  const graph = new MathematicalDependencyGraph();
  graph.addNode({ nodeId: 'parent', type: 'lemma', canonicalStatement: '0 = 0', status: 'formalized' });
  graph.addNode({ nodeId: 'child', type: 'theorem', canonicalStatement: '1 = 1', status: 'formalized' });
  graph.addEdge({ from: 'parent', to: 'child', type: 'uses' });
  const registry = new VerificationRegistry();
  const gate = new LeanIncrementalGate({ graph, registry, toolchainVersion, environmentDigest,
    executor: async () => execution });
  return { graph, registry, gate };
}

async function rejectedExecutions() {
  for (const execution of [
    { exitCode: 0, toolchainVersion },
    { exitCode: 0, toolchainVersion, axioms: null },
    { exitCode: 0, toolchainVersion, axioms: ['sorryAx'] },
    { exitCode: 0, toolchainVersion, axioms: ['untrusted_axiom'] },
    { exitCode: 0, toolchainVersion: 'other', axioms: [] },
    { exitCode: 0, toolchainVersion, axioms: [], status: 'inconclusive' },
  ]) {
    const { gate, registry } = setup(execution);
    const receipt = await gate.verifyNode({ nodeId: 'parent', source: 'theorem p : 0 = 0 := by rfl' });
    assert.equal(receipt.status, 'failed');
    assert.equal(registry.size(), 0);
  }
}

async function receiptAuthority() {
  const { graph, gate, registry } = setup({ exitCode: 0, toolchainVersion, axioms: [] });
  assert.equal(registry.registerVerified({ status: 'passed', receiptDigest: environmentDigest }), false);
  const parent = await gate.verifyNode({ nodeId: 'parent', source: 'theorem p : 0 = 0 := by rfl' });
  const child = await gate.verifyNode({ nodeId: 'child', source: 'theorem c : 1 = 1 := by rfl' });
  assert.equal(registry.isLeanReceiptValid({ ...parent }), true);
  for (const changed of [
    { ...parent, nodeId: 'other' }, { ...parent, sourceDigest: environmentDigest },
    { ...parent, axioms: ['sorryAx'] }, { ...parent, reason: 'changed' },
  ]) assert.equal(registry.isLeanReceiptValid(changed), false);
  assert.equal(Object.isFrozen(parent.axioms), true);
  graph.updateStatus('parent', 'formalized');
  await gate.verifyNode({ nodeId: 'parent', source: 'theorem p : 0 = 0 := by sorry' });
  assert.equal(registry.isLeanReceiptValid(child), false);
  assert.equal(graph.getNode('child').status, 'blocked');
  assert.equal(gate.verificationReceipt('child'), null);
  assert.equal((await gate.verifyNode({ nodeId: 'unknown', source: '' })).status, 'failed');
}

async function omegaFailures() {
  const descriptor = { source: 'theorem p : False := by sorry', canonicalStatement: 'False' };
  assert.equal((await verifyLeanCandidate(null, descriptor)).reason, 'lean_placeholders_forbidden');
  assert.equal((await verifyLeanCandidate(null, { ...descriptor, source: 'theorem p : False := by exact sorryAx False false' })).status, 'inconclusive');
  const source = 'theorem p : 0 = 0 := by rfl';
  assert.equal((await verifyLeanCandidate(source, {})).reason, 'lean_statement_missing');
  assert.equal((await verifyLeanCandidate(source, { canonicalStatement: 'False' })).reason, 'lean_statement_mismatch');
  const missing = await verifyLeanCandidate(source, { canonicalStatement: '0 = 0', toolchainVersion,
    leanExecutable: 'genos-deliberately-absent-lean-executable' });
  assert.equal(missing.status, 'inconclusive');
}

async function proofArtifactAuthority() {
  const { mockVerifiedProof } = require('./helpers/mockVerifiedProof.cjs');
  const { MathematicalCulture } = require('../src/services/mathematical/mathematicalCultureService');
  const proofArtifact = await mockVerifiedProof();
  const culture = new MathematicalCulture();
  assert.equal(culture.addArtifact({ type: 'lemma', content: 'False', proofArtifact }).verified, false);
  assert.equal(new MathematicalCulture({ registry: null }).addArtifact({ type: 'lemma', content: '0 = 0', proofArtifact }).verified, false);
  const legitimate = culture.addArtifact({ type: 'lemma', content: '0 = 0', proofArtifact });
  assert.equal(legitimate.verified, true);
  const original = proofArtifact._formalResult;
  assert.equal(Object.isFrozen(original.validityDomain), true);
  proofArtifact._formalResult = { ...original, canonicalStatement: 'False' };
  assert.equal(proofArtifact.isVerified(), false);
  const recipient = { _knowledge: [], genome: { strategies: [] } };
  culture.transmit(legitimate.id, recipient);
  assert.equal(recipient._knowledge.length, 0);
}

async function strategyExecution() {
  const { createMathematicalOrganismRuntime } = require('../src/services/mathematical/mathematicalOrganismRuntime');
  const { verify } = require('../src/services/mathematical/mathematicalOrganismExplore');
  const runtime = createMathematicalOrganismRuntime();
  runtime.initialize({ statement: '0 = 0', domain: 'general' });
  runtime.formalizationRegistry.add(new FormalizationArtifact({ naturalStatement: '0 = 0', formalStatement: '0 = 0' }));
  const sources = [];
  runtime.setLeanGate(new LeanIncrementalGate({ graph: new MathematicalDependencyGraph(), toolchainVersion, environmentDigest,
    executor: async (request) => { sources.push(request.source); return { exitCode: 0, toolchainVersion, axioms: [] }; } }));
  const attempts = ['ring', 'simp', 'unsupported'].map((strategy) => ({ id: strategy, strategy, goal: '0 = 0' }));
  assert.equal((await verify(runtime, attempts)).length, 2);
  assert.equal(sources.length, 2, 'unsupported strategy must not run a substituted proof');
  assert.notEqual(sources[0], sources[1], 'different strategies must reach the executor as different proof bodies');
  assert.equal(runtime.history.some((event) => event.event === 'proof_strategy_unavailable'), true);
}

async function run() {
  await rejectedExecutions();
  await receiptAuthority();
  await omegaFailures();
  await proofArtifactAuthority();
  await strategyExecution();
  assert.equal(sourceTarget('import Init; axiom bad : False\ntheorem p : False := bad'), null);
  const literal = new FormalizationArtifact({ formalStatement: '"a  b" = "a b"' });
  assert.equal(literal.checkSourceBinding('theorem p : "a b" = "a b" := by rfl').matched, false);
  assert.notEqual(formalStatementFingerprint('"é" = "x"'), formalStatementFingerprint('"e\u0301" = "x"'));
  process.env.GENOS_LEAN_TEST_SECRET = 'must-not-be-inherited';
  assert.equal(leanProcessEnvironment().GENOS_LEAN_TEST_SECRET, undefined);
  delete process.env.GENOS_LEAN_TEST_SECRET;
  const claims = Array.from({ length: 10 }, () => ({ statement: 'assertion', evidence: ['same log', ' same log '] }));
  assert.equal(evidenceScore({ evidenceReport: { claims } }), 12);
  const noAnswerProof = { evidence: Array(10).fill('same observation') };
  assert.equal(evidenceScore({ evidenceReport: { outcome: 'no_answer', noAnswerProof } }), 35);
  console.log('Lean verification contract: missing audits, receipts, revocation, Omega and duplicate evidence PASS.');
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
