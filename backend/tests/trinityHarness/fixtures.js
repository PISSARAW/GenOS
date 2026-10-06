'use strict';

const assert = require('node:assert/strict');
const crypto = require('crypto');
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
const trinityClaimVerification = require('../../src/services/trinityEvidenceAudit');
const modelRouter = require('../../src/services/modelRouter');

const GENOS_EPISTEMIC_RECEIPT_SECRET = process.env.GENOS_EPISTEMIC_RECEIPT_SECRET || 'test-secret-for-verifier-execution';

const EXECUTABLE_VARIANTS = [
  { id: 'controlled', mission: 'Compare three sorting implementations for correctness and performance', tags: ['baseline'] },
  { id: 'heterogeneous', mission: 'Compare diverse strategies from different providers for a data processing task', tags: ['diversity'] },
  { id: 'adversarial', mission: 'Security threat red team attack review: find vulnerabilities in authentication system', tags: ['security', 'falsification'] },
  { id: 'counterfactual', mission: 'Analyze counterfactual sensitivity: what if timeline doubled vs halved for project delivery', tags: ['sensitivity', 'causal'] },
  { id: 'factorial', mission: 'Run factorial experiment across model and strategy for code generation quality', tags: ['experiment', 'anova'] },
  { id: 'pareto', mission: 'Multi-objective Pareto optimization: cost vs latency vs correctness for API design', tags: ['multi-objective', 'pareto'] },
  { id: 'jury', mission: 'Blind jury anonymous deliberation for three competing architectural proposals', tags: ['jury', 'adjudication'] },
  { id: 'recursive', mission: 'Recursive decomposition of hard subproblem: distribute workload across team', tags: ['recursive', 'decomposition'] },
  { id: 'adaptive', mission: 'Adaptive resource allocation with dynamic budget for continuous integration pipeline', tags: ['adaptive', 'budget'] },
  { id: 'temporal', mission: 'Evaluate long-term temporal horizons: immediate fix vs maintenance vs reversibility', tags: ['temporal', 'horizons'] },
  { id: 'oracular', mission: 'Oracle predict winner before run: which refactoring approach will perform best', tags: ['oracle', 'prediction'] },
  { id: 'exploratory', mission: 'Creative open-ended novelty exploration: generate innovative API designs', tags: ['novelty', 'exploratory'] }
];

const FACTUAL_MISSIONS = [
  'Résous les 12 pièces en trois pesées et prouve que la stratégie couvre tous les cas.',
  'Cherche activement des explications concurrentes et indique ce qui permettrait de les réfuter.',
  'Produis une conclusion qui survive à une tentative systématique de réfutation.'
];

function makeReceipt({ verifierName, status, evidence, assumptions = [] }) {
  const digest = `sha256:${crypto.createHash('sha256').update(JSON.stringify({ verifier: verifierName, evidence, timestamp: Date.now() })).digest('hex')}`;
  return {
    status,
    independent: true,
    evidenceDigest: digest,
    verifierDigest: `sha256:${crypto.createHash('sha256').update(verifierName).digest('hex')}`,
    independenceDescriptor: { actorId: verifierName, workspaceId: `test-${verifierName}-${Date.now()}` },
    assumptions,
    executedAt: new Date().toISOString(),
    id: `receipt_${verifierName}_${Date.now()}`
  };
}

function createWorldReport({ worldNumber, role, evidenceVector, claims = [], tests = [], artifactText = '', uncertainties = [], unverifiedClaims = [] }) {
  const { evidenceReceipts, processedTests } = reportEvidence(worldNumber, claims, tests);
  const allEvidenceIds = Object.keys(evidenceReceipts);
  const evidenceVectorEvidence = {};
  for (const key of Object.keys(evidenceVector)) {
    evidenceVectorEvidence[key] = allEvidenceIds.slice(0, 2);
  }

  return {
    worldNumber,
    role,
    report: {
      outcome: 'success',
      claims: reportClaims(worldNumber, claims),
      tests: processedTests,
      uncertainties,
      unverifiedClaims,
      evidenceVector,
      artifactText,
      evidence: Object.entries(evidenceReceipts).map(([id, receipt]) => ({ id, verificationReceipt: receipt })),
      evidenceVectorEvidence,
      coverage: evidenceVector.coverage || 0,
      coverageReceipt: makeReceipt({ verifierName: 'coverage_verifier', status: 'verified', evidence: ['coverage'] }),
      hardConstraintsPassed: evidenceVector.correctness >= 0.8,
      budgetStatus: 'within'
    }
  };
}

function reportClaims(worldNumber, claims) {
  return claims.map((c, i) => ({
        id: `claim_w${worldNumber}_${i}`,
        statement: c.statement,
        evidence: c.evidence || [`ev_w${worldNumber}_${i}`],
        verificationLevel: c.verificationLevel || 'verified',
        falsificationCriteria: c.falsificationCriteria || []
      }));
}

function reportEvidence(worldNumber, claims, tests) {
  const evidenceReceipts = {};
  const testReceipts = {};

  const claimEvidences = claims.map((c, i) => {
    const evIds = c.evidence || [`ev_w${worldNumber}_${i}`];
    const receipt = makeReceipt({ verifierName: `claim_verifier_${worldNumber}_${i}`, status: 'verified', evidence: evIds });
    for (const id of evIds) evidenceReceipts[id] = receipt;
    return { id: evIds[0], verificationReceipt: receipt };
  });

  const processedTests = tests.map((t, i) => {
    const receipt = t.receipt || makeReceipt({ verifierName: `test_executor_${worldNumber}_${i}`, status: 'verified', evidence: [`test_ev_${worldNumber}_${i}`] });
    testReceipts[t.name || `test_${i}`] = receipt;
    for (const id of receipt.evidenceDigest ? [receipt.evidenceDigest] : []) evidenceReceipts[id] = receipt;
    return { name: t.name || `test_${i}`, passed: t.passed === true, verificationReceipt: receipt };
  });

  return { evidenceReceipts, processedTests };
}

function leaf(coin, direction) {
  return { result: { coin, direction } };
}

function node(left, right, branches) {
  return { weighing: { left, right }, branches };
}

function canonicalTree() {
  const h1 = node([1, 2, 5], [3, 6, 9], {
    left_heavy: node([1], [2], { left_heavy: leaf(1, 'heavy'), right_heavy: leaf(2, 'heavy'), balance: leaf(6, 'light') }),
    right_heavy: node([3], [9], { left_heavy: leaf(3, 'heavy'), right_heavy: leaf(5, 'light'), balance: leaf(5, 'light') }),
    balance: node([7], [8], { left_heavy: leaf(8, 'light'), right_heavy: leaf(7, 'light'), balance: leaf(4, 'heavy') })
  });
  const h2 = node([1, 2, 5], [3, 6, 9], {
    left_heavy: node([3], [9], { left_heavy: leaf(5, 'heavy'), right_heavy: leaf(3, 'light'), balance: leaf(5, 'heavy') }),
    right_heavy: node([1], [2], { left_heavy: leaf(2, 'light'), right_heavy: leaf(1, 'light'), balance: leaf(6, 'heavy') }),
    balance: node([7], [8], { left_heavy: leaf(7, 'heavy'), right_heavy: leaf(8, 'heavy'), balance: leaf(4, 'light') })
  });
  const balanced = node([9, 10, 11], [1, 2, 3], {
    left_heavy: node([9], [10], { left_heavy: leaf(9, 'heavy'), right_heavy: leaf(10, 'heavy'), balance: leaf(11, 'heavy') }),
    right_heavy: node([9], [10], { left_heavy: leaf(10, 'light'), right_heavy: leaf(9, 'light'), balance: leaf(11, 'light') }),
    balance: node([12], [1], { left_heavy: leaf(12, 'heavy'), right_heavy: leaf(12, 'light'), balance: leaf(12, 'heavy') })
  });
  return node([1, 2, 3, 4], [5, 6, 7, 8], { left_heavy: h1, right_heavy: h2, balance: balanced });
}

module.exports = { assert, crypto, trinity, trinityVariants, trinityAdapters, balanceVerifier, missionVerifier, counterfactual, adversarial, factorial, diversity, recursive, temporal, sequential, oracle, novelty, pareto, blindJury, trinityClaimVerification, modelRouter, EXECUTABLE_VARIANTS, FACTUAL_MISSIONS, makeReceipt, createWorldReport, leaf, node, canonicalTree };
