'use strict';

const crypto = require('crypto');

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

function makeReceipt(verifierName, status, evidence) {
  const assumptions = [];
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

function collectReceipts(input) {
  const evidenceReceipts = {};
  for (const [index, claim] of input.claims.entries()) {
    const ids = claim.evidence || ['ev_w' + input.worldNumber + '_' + index];
    const receipt = makeReceipt('claim_verifier_' + input.worldNumber + '_' + index, 'verified', ids);
    for (const id of ids) evidenceReceipts[id] = receipt;
  }
  const processedTests = input.tests.map((test, index) => {
    const receipt = test.receipt || makeReceipt('test_executor_' + input.worldNumber + '_' + index,
      'verified', ['test_ev_' + input.worldNumber + '_' + index]);
    if (receipt.evidenceDigest) evidenceReceipts[receipt.evidenceDigest] = receipt;
    return { name: test.name || 'test_' + index, passed: test.passed === true, verificationReceipt: receipt };
  });
  return { evidenceReceipts, processedTests };
}

function vectorReferences(evidenceVector, evidenceReceipts) {
  const ids = Object.keys(evidenceReceipts).slice(0, 2);
  return Object.fromEntries(Object.keys(evidenceVector).map((key) => [key, ids]));
}

function createWorldReport(input) {
  const { worldNumber, role, evidenceVector, claims = [], tests = [], artifactText = '',
    uncertainties = [], unverifiedClaims = [] } = input;
  const { evidenceReceipts, processedTests } = collectReceipts({ claims, tests, worldNumber });
  const evidenceVectorEvidence = vectorReferences(evidenceVector, evidenceReceipts);

  return {
    worldNumber,
    role,
    report: {
      claims: claims.map((c, i) => ({
        id: `claim_w${worldNumber}_${i}`,
        statement: c.statement,
        evidence: c.evidence || [`ev_w${worldNumber}_${i}`],
        verificationLevel: c.verificationLevel || 'verified',
        falsificationCriteria: c.falsificationCriteria || []
      })),
      tests: processedTests,
      uncertainties,
      unverifiedClaims,
      evidenceVector,
      artifactText,
      evidence: Object.values(evidenceReceipts),
      evidenceVectorEvidence,
      coverage: evidenceVector.coverage || 0,
      coverageReceipt: makeReceipt('coverage_verifier', 'verified', ['coverage']),
      hardConstraintsPassed: evidenceVector.correctness >= 0.8,
      budgetStatus: 'within'
    }
  };
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

module.exports = { EXECUTABLE_VARIANTS, FACTUAL_MISSIONS, makeReceipt, createWorldReport, leaf, node, canonicalTree };
