'use strict';

const assert = require('node:assert/strict');
const { createFormalResult } = require('../src/services/formalResultService');
const { evaluateEpistemicAssurance } = require('../src/services/epistemicAssuranceService');
const promotionPolicy = require('../src/services/strategyPromotionPolicyService');
const verifierReceipts = require('../src/services/epistemicVerifierReceiptService');

process.env.GENOS_EPISTEMIC_RECEIPT_SECRET = 'test-epistemic-receipt-secret';

function hash(character) {
  return `sha256:${character.repeat(64)}`;
}

function formalInput(overrides = {}) {
  return {
    canonicalStatement: 'Le résultat R est valide sous A1.',
    assumptions: [{ id: 'A1', statement: 'Le domaine est fini.' }],
    validityDomain: { statement: 'Instances finies.', constraints: ['taille >= 1'] },
    dependencies: [],
    status: 'verified',
    evidence: { kind: 'proof', content: { calculus: 'bounded-checker', certificate: 'ok' } },
    provenance: {
      createdAt: '2026-09-19T10:00:00.000Z',
      actor: 'agent:solver',
      source: { type: 'proof', uri: 'genos://proofs/r', digest: hash('a') },
      inputs: [{ id: 'problem', digest: hash('b') }],
      transformations: ['canonicalize', 'prove'],
    },
    producer: { model: 'test-model', version: '1' },
    ...overrides,
  };
}

function validAssembly() {
  const input = formalInput();
  const result = createFormalResult(input);
  const verifierDigest = hash('c');
  const verification = verifierReceipts.issueReceipt({
    resultId: result.resultId,
    evidenceDigest: result.evidence.digest,
    verifierDigest,
    checkedAt: '2026-09-19T11:00:00.000Z',
    nonce: 'verification-1',
    independent: true,
  });
  return {
    results: [input],
    obligations: [{ id: 'O1', statement: 'Démontrer R sous A1.', required: true }],
    coverage: [{ obligationId: 'O1', resultId: result.resultId, evidenceDigest: result.evidence.digest }],
    constraintAttestations: [
      { actorId: 'agent:extractor-a', independent: true, obligationIds: ['O1'] },
      { actorId: 'agent:extractor-b', independent: true, obligationIds: ['O1'] },
    ],
    trustedVerifierDigests: [verifierDigest],
    verifications: [verification],
    compositionRoots: [result.resultId],
    workerIds: ['worker-1'],
    contributions: [{ workerId: 'worker-1', usedResultIds: [result.resultId], decisionWitness: hash('d') }],
  };
}

function policies(evaluation) {
  return evaluation.violations.map((item) => item.policy);
}

function clone(value) {
  return structuredClone(value);
}

function assertBlocked(assembly, expectedPolicy) {
  const evaluation = evaluateEpistemicAssurance(assembly);
  assert.equal(evaluation.eligible, false);
  assert.ok(policies(evaluation).includes(expectedPolicy), JSON.stringify(evaluation.violations));
}

function testValidAssembly() {
  const evaluation = evaluateEpistemicAssurance(validAssembly());
  assert.equal(evaluation.eligible, true, JSON.stringify(evaluation.violations));
  assert.match(evaluation.assemblyDigest, /^sha256:[a-f0-9]{64}$/);
}

function testForgottenConstraint() {
  const assembly = validAssembly();
  assembly.coverage = [];
  assertBlocked(assembly, 'constraint_closure');
  const census = validAssembly();
  census.constraintAttestations.pop();
  assertBlocked(census, 'constraint_census');
}

function testFalseProof() {
  const assembly = validAssembly();
  assembly.verifications[0].evidenceDigest = hash('e');
  assertBlocked(assembly, 'proof_verification');
}

function testForgedVerifierReceipt() {
  const assembly = validAssembly();
  assembly.verifications[0].status = 'passed';
  assertBlocked(assembly, 'proof_verification');
}

function testDuplicateReasoning() {
  const assembly = validAssembly();
  const duplicate = clone(assembly.results[0]);
  duplicate.producer = { model: 'independent-model', version: '2' };
  assembly.results.push(duplicate);
  assertBlocked(assembly, 'semantic_deduplication');
  const first = createFormalResult(assembly.results[0]);
  const second = createFormalResult(duplicate);
  assembly.deduplications = [{ canonicalResultId: first.resultId, members: [first.resultId, second.resultId] }];
  assert.equal(evaluateEpistemicAssurance(assembly).eligible, true);
}

function testContradiction() {
  const assembly = validAssembly();
  assembly.relations = [{ id: 'C1', type: 'contradicts', domainOverlap: 'unknown' }];
  assertBlocked(assembly, 'logical_contradiction');
  assembly.contradictionResolutions = [{ relationId: 'C1', status: 'proved', decision: 'domain_partition', witnessDigest: hash('f') }];
  assert.equal(evaluateEpistemicAssurance(assembly).eligible, true);
}

function testInvalidComposition() {
  const assembly = validAssembly();
  assembly.compositionRoots = [hash('0')];
  assertBlocked(assembly, 'proof_composition');
}

function testFailureApplicability() {
  const assembly = validAssembly();
  assembly.failureReuses = [{ failureId: 'F1', status: 'applicable' }];
  assertBlocked(assembly, 'failure_applicability');
}

function testDisconnectedContribution() {
  const assembly = validAssembly();
  assembly.contributions = [];
  assertBlocked(assembly, 'causal_contribution');
}

function testPromotionIntegration() {
  const contract = { promotion: { require_epistemic_assurance: true, epistemic_verifier_digests: [hash('c')] } };
  const missing = promotionPolicy.evaluatePromotionGate(contract, { report: {} });
  assert.equal(missing.eligible, false);
  assert.ok(policies(missing).includes('require_epistemic_assurance'));
  const accepted = promotionPolicy.evaluatePromotionGate(contract, { report: { epistemicAssembly: validAssembly() } });
  assert.equal(accepted.eligible, true, JSON.stringify(accepted.violations));
}

testValidAssembly();
testForgottenConstraint();
testFalseProof();
testForgedVerifierReceipt();
testDuplicateReasoning();
testContradiction();
testInvalidComposition();
testFailureApplicability();
testDisconnectedContribution();
testPromotionIntegration();
console.log('Epistemic assurance gate checks passed.');
