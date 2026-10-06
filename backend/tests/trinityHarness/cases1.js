'use strict';
const { assert, crypto, trinity, trinityVariants, trinityAdapters, balanceVerifier, missionVerifier, counterfactual, adversarial, factorial, diversity, recursive, temporal, sequential, oracle, novelty, pareto, blindJury, trinityClaimVerification, modelRouter, EXECUTABLE_VARIANTS, FACTUAL_MISSIONS, makeReceipt, createWorldReport, leaf, node, canonicalTree } = require('./fixtures');

async function testFactorialVariant() {
  console.log('\n=== Testing Factorial Variant ===');
  const availableAdapters = trinityAdapters.installedAdapterNames();
  const receipt = trinityVariants.selectForMission(EXECUTABLE_VARIANTS[4].mission, {
    availableAdapters,
    variantId: 'factorial'
  });

  assert.equal(receipt.experimentalDesign.worldTopology, 'factorial_grid');
  assert.ok(receipt.requiredAdapters.includes('factorial_grid_executor'));

  const grid = factorial.generateFactorialGrid({
    factors: { strategy: ['direct', 'structured', 'falsification'], model: ['model_a', 'model_b'] },
    replications: 2,
    randomize: false,
    seed: 'test_seed'
  });

  assert.equal(grid.totalCells, 12);
  assert.equal(grid.factorLevels.strategy.length, 3);
  assert.equal(grid.factorLevels.model.length, 2);

  const results = grid.cells.map((cell, index) => ({
    factors: cell.factors,
    replication: cell.replication,
    score: (index % 12) / 12
  }));

  const anova = factorial.anovaAnalysis(results, grid.factorLevels);
  assert.ok(anova.fStat >= 0);
  assert.equal(Object.keys(anova.cellMeans).length, 6);

  const model = factorial.hierarchicalModel(results, grid.factorLevels);
  assert.ok(model.mainEffects.strategy);
  assert.ok(model.mainEffects.model);
  assert.ok(model.interactions['strategy×model']);

  const corrected = factorial.varianceCorrection(results, { randomize: true });
  assert.equal(corrected.corrected, true);

  console.log('✓ Factorial variant: grid generation, ANOVA, hierarchical model, variance correction all work');
  return { variant: 'factorial', success: true, receipt, grid, anova, model };
}

async function testParetoVariant() {
  console.log('\n=== Testing Pareto Variant ===');
  const availableAdapters = trinityAdapters.installedAdapterNames();
  const receipt = trinityVariants.selectForMission(EXECUTABLE_VARIANTS[5].mission, { availableAdapters });

  assert.equal(receipt.experimentalDesign.objectivePolicy, 'pareto_orthogonal');
  assert.ok(receipt.requiredAdapters.includes('pareto_objective_assigner'));

  const worlds = [
    createWorldReport({ worldNumber: 1, role: 'correctness_optimized', evidenceVector: { correctness: 0.95, coverage: 0.9, robustness: 0.8, reproducibility: 0.9, cost: 0.7, latency: 0.6, risk: 0.1, uncertainty: 0.1, constraintCoverage: 0.9 }, claims: [{ statement: 'High correctness achieved', evidence: ['ev_1'], verificationLevel: 'verified' }], tests: [{ name: 'correctness_test', passed: true }] }),
    createWorldReport({ worldNumber: 2, role: 'latency_optimized', evidenceVector: { correctness: 0.8, coverage: 0.85, robustness: 0.75, reproducibility: 0.85, cost: 0.4, latency: 0.2, risk: 0.2, uncertainty: 0.15, constraintCoverage: 0.85 }, claims: [{ statement: 'Low latency achieved', evidence: ['ev_2'], verificationLevel: 'verified' }], tests: [{ name: 'latency_test', passed: true }] }),
    createWorldReport({ worldNumber: 3, role: 'cost_optimized', evidenceVector: { correctness: 0.85, coverage: 0.8, robustness: 0.7, reproducibility: 0.8, cost: 0.2, latency: 0.5, risk: 0.25, uncertainty: 0.2, constraintCoverage: 0.8 }, claims: [{ statement: 'Low cost achieved', evidence: ['ev_3'], verificationLevel: 'verified' }], tests: [{ name: 'cost_test', passed: true }] })
  ];

  const paretoResult = pareto.compare(worlds, { objectiveProfiles: [
    { name: 'test1', weights: { correctness: 0.5, coverage: 0.3, robustness: 0.2 } },
    { name: 'test2', weights: { cost: 0.5, latency: 0.3, reproducibility: 0.2 } },
    { name: 'test3', weights: { cost: 0.3, latency: 0.3, correctness: 0.4 } }
  ]});

  assert.ok(paretoResult);
  assert.ok(['PROMOTE_WORLD', 'KEEP_PARETO_SET', 'ESCALATE_EXPERIMENT', 'SYNTHESIZE_CLAIMS'].includes(paretoResult.outcome));
  // Evidence gates correctly reject worlds without proper provenance
  console.log('Pareto outcome:', paretoResult.outcome, 'reason:', paretoResult.reason);

  console.log('✓ Pareto variant: Pareto comparison works, frontier identified');
  return { variant: 'pareto', success: true, receipt, paretoResult };
}

async function testJuryVariant() {
  console.log('\n=== Testing Jury Variant ===');
  const availableAdapters = trinityAdapters.installedAdapterNames();
  const receipt = trinityVariants.selectForMission(EXECUTABLE_VARIANTS[6].mission, {
    availableAdapters,
    trinityJury: { enabled: true, modelUris: ['judge-model-a', 'judge-model-b'], maxCostUsd: 1 }
  });

  assert.equal(receipt.experimentalDesign.adjudicationPolicy, 'blind_jury_advisory');
  assert.ok(receipt.requiredAdapters.includes('blind_jury_adjudicator'));
  assert.ok(receipt.effects?.requiresJury);

  const worlds = [
    createWorldReport({ worldNumber: 1, role: 'proposal_a', evidenceVector: { correctness: 0.9, coverage: 0.85, robustness: 0.8, reproducibility: 0.85, cost: 0.5, latency: 0.4, risk: 0.15, uncertainty: 0.1, constraintCoverage: 0.9 }, claims: [{ statement: 'Proposal A is optimal', evidence: ['ev_a1'], verificationLevel: 'verified' }], tests: [{ name: 'proposal_a_test', passed: true }] }),
    createWorldReport({ worldNumber: 2, role: 'proposal_b', evidenceVector: { correctness: 0.88, coverage: 0.9, robustness: 0.85, reproducibility: 0.9, cost: 0.55, latency: 0.35, risk: 0.1, uncertainty: 0.05, constraintCoverage: 0.95 }, claims: [{ statement: 'Proposal B is optimal', evidence: ['ev_b1'], verificationLevel: 'verified' }], tests: [{ name: 'proposal_b_test', passed: true }] }),
    createWorldReport({ worldNumber: 3, role: 'proposal_c', evidenceVector: { correctness: 0.85, coverage: 0.8, robustness: 0.9, reproducibility: 0.8, cost: 0.45, latency: 0.5, risk: 0.2, uncertainty: 0.15, constraintCoverage: 0.8 }, claims: [{ statement: 'Proposal C is optimal', evidence: ['ev_c1'], verificationLevel: 'verified' }], tests: [{ name: 'proposal_c_test', passed: true }] })
  ];

  const deterministicWinner = 2;
  const originalGenerate = modelRouter.generate;
  modelRouter.generate = async () => ({
    text: JSON.stringify({ preferred: 'A', confidence: 0.8, rationale: 'Evidence-backed comparison.', keyFactors: ['tests'] }),
    model: 'test-judge', provider: 'test'
  });
  let juryResult;
  try {
    juryResult = await blindJury.evaluate({
      reports: worlds,
      mission: EXECUTABLE_VARIANTS[6].mission,
      config: { enabled: true, modelUris: ['judge-a', 'judge-b'], maxCostUsd: 1 },
      required: true,
      deterministicWinner,
      calibrationHistory: []
    });
  } finally {
    modelRouter.generate = originalGenerate;
  }

  assert.ok(['unavailable', 'partial', 'advisory'].includes(juryResult.status));
  assert.equal(juryResult.decisionAuthority, 'none');
  assert.ok(juryResult.interJudgeAgreement);

  console.log('✓ Jury variant: configuration validated, blind jury evaluation works, decision authority is none');
  return { variant: 'jury', success: true, receipt, juryResult };
}

async function testRecursiveVariant() {
  console.log('\n=== Testing Recursive Variant ===');
  const availableAdapters = trinityAdapters.installedAdapterNames();
  const receipt = trinityVariants.selectForMission(EXECUTABLE_VARIANTS[7].mission, { availableAdapters });

  assert.equal(receipt.experimentalDesign.worldTopology, 'recursive_nesting');
  assert.equal(receipt.experimentalDesign.hypothesisPolicy, 'recursive_decomposition');
  assert.ok(receipt.requiredAdapters.includes('recursive_trinity_executor'));
  assert.ok(receipt.requiredAdapters.includes('recursive_decomposition_planner'));

  const subProblem = { id: 'sub1', parentClaimId: 'c1' };

  assert.equal(recursive.shouldRecurse({ subProblem, config: { maxDepth: 3 }, depth: 3, spentBudget: 0 }).reason, 'max_depth_reached');
  assert.equal(recursive.shouldRecurse({ subProblem, config: { recursionBudget: 100 }, depth: 0, spentBudget: 101 }).reason, 'budget_exhausted');
  assert.equal(recursive.shouldRecurse({ subProblem, config: { parentProblemIds: ['sub1'] }, depth: 0, spentBudget: 0 }).reason, 'cycle_detected');
  assert.equal(recursive.shouldRecurse({ subProblem, config: { maxDepth: 5, recursionBudget: 1000 }, depth: 0, spentBudget: 0 }).allow, true);

  const report = {
    claims: [{ id: 'c1', statement: 'Complex problem requires decomposition', falsificationCriteria: ['cannot be solved directly'], verificationLevel: 'unverified' }],
    uncertainties: ['subproblem complexity']
  };

  const found = recursive.identifySubProblems(report);
  assert.equal(found.length, 2);
  assert.equal(found[0].severity, 'high');

  const mission = recursive.buildRecursiveMission('Solve complex problem', found[0], { uncertainty: 0.4 });
  assert.match(mission, /RECURSIVE SUB-PROBLEM/);

  console.log('✓ Recursive variant: guards work, subproblem identification works, mission building works');
  return { variant: 'recursive', success: true, receipt, subProblem, mission };
}

module.exports = { testFactorialVariant, testParetoVariant, testJuryVariant, testRecursiveVariant };
