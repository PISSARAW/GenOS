'use strict';

const assert = require('node:assert/strict');
const trinity = require('../../src/services/trinityService');
const trinityVariants = require('../../src/services/trinityVariantService');
const trinityAdapters = require('../../src/services/trinityAdapters');
const balanceVerifier = require('../../src/services/trinityBalancePuzzleVerifier');
const missionVerifier = require('../../src/services/trinityMissionVerifierService');
const counterfactual = require('../../src/services/trinityCounterfactualFork');
const adversarial = require('../../src/services/trinityAdversarialCrossExamination');
const factorial = require('../../src/services/trinityFactorialGrid');
const diversity = require('../../src/services/trinityDiversityPlanner');
const recursive = require('../../src/services/trinityRecursiveExecutor');
const temporal = require('../../src/services/trinityTemporalHorizons');
const sequential = require('../../src/services/trinityAdaptiveSequential');
const oracle = require('../../src/services/trinityOracle');
const novelty = require('../../src/services/trinityNoveltyArchive');
const pareto = require('../../src/services/trinityParetoService');
const blindJury = require('../../src/services/trinityBlindJuryService');
const trinityEvidenceAudit = require('../../src/services/trinityEvidenceAudit');
const modelRouter = require('../../src/services/modelRouter');
const { EXECUTABLE_VARIANTS, FACTUAL_MISSIONS, makeReceipt, createWorldReport,
  leaf, node, canonicalTree } = require('./fixtures');

async function testFactualMissions() {
  console.log('\n=== Testing Factual Mission Detection ===');
  const availableAdapters = trinityAdapters.installedAdapterNames();

  for (const mission of FACTUAL_MISSIONS) {
    const receipt = trinityVariants.selectForMission(mission, { availableAdapters });
    assert.equal(receipt.selectedPreset, 'adversarial', `Mission: ${mission}`);
  }

  console.log('✓ Factual missions correctly trigger adversarial variant');
  return { success: true };
}

async function testEvidenceGates() {
  console.log('\n=== Testing Evidence Gates ===');

  const worlds = [
    createWorldReport({ worldNumber: 1, role: 'test', evidenceVector: { correctness: 1, coverage: 1, robustness: 1, reproducibility: 1, cost: 0.5, latency: 0.5, risk: 0, uncertainty: 0, constraintCoverage: 1 }, claims: [
        { statement: 'All cases covered', evidence: ['ev_1'], verificationLevel: 'independent_deterministic', falsificationCriteria: ['edge case'] }
      ], tests: [{ name: 'exhaustive_test', passed: true, receipt: makeReceipt('exhaustive_verifier', 'verified', ['ev_1']) }], artifactText: 'artifact' }),
    createWorldReport({ worldNumber: 2, role: 'test', evidenceVector: { correctness: 0.8, coverage: 0.7, robustness: 0.6, reproducibility: 0.7, cost: 0.4, latency: 0.3, risk: 0.2, uncertainty: 0.1, constraintCoverage: 0.7 }, claims: [{ statement: 'Partial coverage', evidence: ['ev_2'], verificationLevel: 'verified' }], tests: [{ name: 'partial_test', passed: true }] }),
    createWorldReport({ worldNumber: 3, role: 'test', evidenceVector: { correctness: 0.9, coverage: 0.85, robustness: 0.8, reproducibility: 0.85, cost: 0.6, latency: 0.4, risk: 0.15, uncertainty: 0.1, constraintCoverage: 0.85 }, claims: [{ statement: 'Good coverage', evidence: ['ev_3'], verificationLevel: 'verified' }], tests: [{ name: 'good_test', passed: true }] })
  ];

  worlds[0].report.weighingTree = canonicalTree();
  const verifiedWorlds = missionVerifier.verifyMissionReports(worlds, '12 pièces, trois pesées');
  const verified = verifiedWorlds[0];

  assert.equal(verified.report.missionContractVerification.status, 'verified');
  assert.equal(verified.report.evidenceVector.coverage, 1);
  assert.ok(verified.report.claims.some((claim) => claim.id === 'balance-tree-world-1-coverage'
    && claim.verificationLevel === 'independent_deterministic'));
  assert.equal(verifiedWorlds[1].report.missionContractVerification.status, 'missing');
  assert.ok(verified.report.tests.length > 0);
  assert.ok(verified.report.evidenceVector.correctness === 1);

  console.log('✓ Evidence gates: mission contract verification, deterministic verification, coverage tracking all work');
  return { success: true, verified };
}

async function testBalanceVerifier() {
  console.log('\n=== Testing Balance Puzzle Verifier ===');

  const tree = canonicalTree();
  const result = balanceVerifier.verify(tree);
  assert.equal(result.verified, true);
  assert.equal(result.covered, 24);
  assert.equal(result.total, 24);
  assert.equal(result.counterexample, null);

  const falseTree = node([1, 2, 3, 4], [5, 6, 7, 8], { left_heavy: leaf(1, 'heavy'), right_heavy: leaf(5, 'heavy'), balance: leaf(9, 'heavy') });
  const falseResult = balanceVerifier.verify(falseTree);
  assert.equal(falseResult.verified, false);
  assert.ok(falseResult.counterexample);

  console.log('✓ Balance verifier: canonical tree verified, false tree rejected with counterexample');
  return { success: true, result, falseResult };
}

async function testClaimVerification() {
  console.log('\n=== Testing Claim Verification ===');

  const report = {
    claims: [
      { id: 'c1', statement: 'System handles 1000 req/s', evidence: ['e1', 'e2'],
        verificationLevel: 'independent_deterministic',
        verificationReceipts: [{ receipt: makeReceipt('throughput-check', 'verified', ['e1', 'e2']) }] },
      { id: 'c2', statement: 'Zero data loss guaranteed', evidence: [], verificationLevel: 'unverified' }
    ],
    evidence: [
      { id: 'e1', type: 'benchmark', data: { throughput: 1050 } },
      { id: 'e2', type: 'test', data: { passed: true } }
    ],
    evidenceVector: { correctness: 0.9, coverage: 0.8, robustness: 0.7 }
  };

  const audit = trinityEvidenceAudit.auditReport(report);
  assert.ok(audit.claimCount === 2);
  assert.ok(audit.proven === 1);
  assert.ok(audit.placeholderRefs === 0);

  const weight = trinityEvidenceAudit.auditClaim(report.claims[0], new Set(['e1', 'e2']));
  assert.ok(weight.weight >= 1);

  const weight2 = trinityEvidenceAudit.auditClaim(report.claims[1], new Set(['e1', 'e2']));
  assert.equal(weight2.weight, 0);

  const isVerified = trinityEvidenceAudit.isIndependentlyVerifiedClaim(report.claims[0]);
  assert.equal(isVerified, true);

  const isUnverified = trinityEvidenceAudit.isIndependentlyVerifiedClaim(report.claims[1]);
  assert.equal(isUnverified, false);

  console.log('✓ Claim verification: audit, weighting, independent verification all work');
  return { success: true, audit, weight, weight2 };
}

async function testVariantGating() {
  console.log('\n=== Testing Variant Precondition Gating ===');

  let threw = false;
  try {
    trinityVariants.selectForMission('Factorial mission', { variantId: 'factorial', availableAdapters: [] });
  } catch (e) {
    threw = true;
    assert.equal(e.code, 'TRINITY_ADAPTER_NOT_EXECUTABLE');
  }
  assert.ok(threw);

  threw = false;
  try {
    trinityVariants.selectForMission('Jury mission', { variantId: 'jury' });
  } catch (e) {
    threw = true;
    assert.equal(e.code, 'TRINITY_VARIANT_PRECONDITION_MISSING');
  }
  assert.ok(threw);

  threw = false;
  try {
    trinityVariants.selectForMission('Nope', { variantId: 'unknown-variant' });
  } catch (e) {
    threw = true;
    assert.equal(e.code, 'TRINITY_VARIANT_UNKNOWN');
  }
  assert.ok(threw);

  console.log('✓ Variant gating: missing adapters, missing jury config, unknown variant all properly rejected');
  return { success: true };
}

module.exports = { testFactualMissions, testEvidenceGates, testBalanceVerifier, testClaimVerification, testVariantGating };
