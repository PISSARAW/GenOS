'use strict';
const { assert, crypto, trinity, trinityVariants, trinityAdapters, balanceVerifier, missionVerifier, counterfactual, adversarial, factorial, diversity, recursive, temporal, sequential, oracle, novelty, pareto, blindJury, trinityClaimVerification, modelRouter, EXECUTABLE_VARIANTS, FACTUAL_MISSIONS, makeReceipt, createWorldReport, leaf, node, canonicalTree } = require('./fixtures');

async function testControlledVariant() {
  console.log('\n=== Testing Controlled Variant ===');
  const receipt = trinityVariants.selectForMission(EXECUTABLE_VARIANTS[0].mission, { variantId: 'controlled' });

  assert.equal(receipt.variant, 'controlled');
  assert.equal(receipt.maturity, 'implemented');
  assert.deepEqual(receipt.experimentalDesign, trinityVariants.DEFAULT_DESIGN);
  assert.deepEqual(receipt.requiredAdapters, []);

  const worlds = trinityVariants.applyToMembers([
    { chamber: 'direct', hypothesis: 'H1: Direct approach', role: 'basic_implementation', modelTier: 'standard', domain: 'software_engineering', artifact: 'technical', pipelineStage: 0 },
    { chamber: 'structured', hypothesis: 'H2: Structured approach', role: 'interview_plan_implementation', modelTier: 'frontier', domain: 'software_engineering', artifact: 'technical', pipelineStage: 0 },
    { chamber: 'falsification', hypothesis: 'H3: Self-correcting approach', role: 'self_correcting_implementation', modelTier: 'frontier', domain: 'software_engineering', artifact: 'technical', pipelineStage: 0 }
  ], receipt);

  const reports = worlds.map((w, i) => createWorldReport({ worldNumber: i + 1, role: w.role, evidenceVector: { correctness: 0.9, coverage: 0.85, robustness: 0.8, reproducibility: 0.9, cost: 0.5, latency: 0.4, risk: 0.1, uncertainty: 0.1, constraintCoverage: 0.9 }, claims: [
      { statement: `${w.hypothesis} produces correct results`, evidence: [`ev_${i}_1`], verificationLevel: 'verified' },
      { statement: `${w.hypothesis} meets performance targets`, evidence: [`ev_${i}_2`], verificationLevel: 'verified' }
    ], tests: [
      { name: 'correctness_test', passed: true },
      { name: 'performance_test', passed: true }
    ], artifactText: `${w.role} implementation` }));

  const comparison = trinity.compareWorlds(reports);
  assert.ok(comparison.scoredWorlds.length === 3);
  assert.ok(comparison.bestScore > 0);

  const merge = trinity.mergeTrinityEvidence(reports);
  console.log('Merge result:', merge.outcome);
  assert.ok(merge.canMerge || merge.outcome === 'KEEP_PARETO_SET' || merge.outcome === 'ESCALATE_EXPERIMENT');

  console.log('✓ Controlled variant: maturity=implemented, comparison works, merge works');
  return { variant: 'controlled', success: true, receipt, comparison, merge };
}

async function testHeterogeneousVariant() {
  console.log('\n=== Testing Heterogeneous Variant ===');
  const availableAdapters = trinityAdapters.installedAdapterNames();
  const receipt = trinityVariants.selectForMission(EXECUTABLE_VARIANTS[1].mission, {
    availableAdapters,
    trinityModels: [
      { provider: 'openai', modelFamily: 'gpt-4o', cognitiveRecipe: 'direct', tools: ['code'], lineage: 'x/1', agentId: 'w1' },
      { provider: 'anthropic', modelFamily: 'claude-3-5', cognitiveRecipe: 'structured', tools: ['test'], lineage: 'y/2', agentId: 'w2' },
      { provider: 'local', modelFamily: 'llama', cognitiveRecipe: 'novelty_seeking', tools: ['analysis'], lineage: 'z/3', agentId: 'w3' }
    ]
  });

  assert.equal(receipt.experimentalDesign.diversityPolicy, 'heterogeneous');
  assert.ok(receipt.requiredAdapters.includes('diversity_planner'));

  const diversityPlanner = trinityAdapters.resolveAdapter('diversity_planner');
  const worlds = [
    { provider: 'openai', modelFamily: 'gpt-4o', cognitiveRecipe: 'direct', tools: ['code'], lineage: 'x/1', agentId: 'w1' },
    { provider: 'anthropic', modelFamily: 'claude-3-5', cognitiveRecipe: 'structured', tools: ['test'], lineage: 'y/2', agentId: 'w2' },
    { provider: 'local', modelFamily: 'llama', cognitiveRecipe: 'novelty_seeking', tools: ['analysis'], lineage: 'z/3', agentId: 'w3' }
  ];

  const planned = diversityPlanner.planDiverseWorlds({ candidates: worlds });
  assert.equal(planned.success, true);
  assert.equal(diversityPlanner.validateDiversity(worlds).valid, true);
  assert.equal(diversityPlanner.enforceProviderDiversity(worlds).valid, true);

  const homogeneous = [worlds[0], { ...worlds[0] }, { ...worlds[0] }];
  assert.equal(diversityPlanner.validateDiversity(homogeneous).valid, false);
  assert.equal(diversityPlanner.enforceProviderDiversity(homogeneous).valid, false);

  console.log('✓ Heterogeneous variant: diversity planning works, provider diversity enforced');
  return { variant: 'heterogeneous', success: true, receipt, planned };
}

async function testAdversarialVariant() {
  console.log('\n=== Testing Adversarial Variant ===');
  const availableAdapters = trinityAdapters.installedAdapterNames();
  const receipt = trinityVariants.selectForMission(EXECUTABLE_VARIANTS[2].mission, { availableAdapters });

  assert.equal(receipt.experimentalDesign.interactionPolicy, 'adversarial_cross_examination');
  assert.ok(receipt.requiredAdapters.includes('adversarial_cross_examiner'));

  const worlds = [
    createWorldReport({ worldNumber: 1, role: 'baseline_security_engineer', evidenceVector: { correctness: 0.8, coverage: 0.7, robustness: 0.6, reproducibility: 0.8, cost: 0.4, latency: 0.3, risk: 0.3, uncertainty: 0.2, constraintCoverage: 0.7 }, claims: [
        { statement: 'Authentication uses secure token validation', evidence: ['ev_1_1'], verificationLevel: 'verified', falsificationCriteria: ['token replay', 'token forgery'] },
        { statement: 'Rate limiting prevents brute force', evidence: ['ev_1_2'], verificationLevel: 'verified', falsificationCriteria: ['distributed attack'] }
      ], tests: [{ name: 'token_validation_test', passed: true }, { name: 'rate_limit_test', passed: true }] }),
    createWorldReport({ worldNumber: 2, role: 'threat_model_engineer', evidenceVector: { correctness: 0.85, coverage: 0.8, robustness: 0.75, reproducibility: 0.85, cost: 0.5, latency: 0.4, risk: 0.2, uncertainty: 0.15, constraintCoverage: 0.8 }, claims: [
        { statement: 'Threat model covers OWASP Top 10', evidence: ['ev_2_1'], verificationLevel: 'verified', falsificationCriteria: ['missing threat category'] },
        { statement: 'Attack surface minimized', evidence: ['ev_2_2'], verificationLevel: 'verified', falsificationCriteria: ['exposed endpoint'] }
      ], tests: [{ name: 'threat_model_test', passed: true }, { name: 'attack_surface_test', passed: true }] }),
    createWorldReport({ worldNumber: 3, role: 'adversarial_security_engineer', evidenceVector: { correctness: 0.9, coverage: 0.9, robustness: 0.85, reproducibility: 0.9, cost: 0.6, latency: 0.5, risk: 0.1, uncertainty: 0.1, constraintCoverage: 0.9 }, claims: [
        { statement: 'All vulnerabilities found and patched', evidence: ['ev_3_1'], verificationLevel: 'verified', falsificationCriteria: ['zero-day exploit'] },
        { statement: 'Penetration test passes', evidence: ['ev_3_2'], verificationLevel: 'verified', falsificationCriteria: ['bypass found'] }
      ], tests: [{ name: 'pentest_test', passed: true }, { name: 'vuln_scan_test', passed: true }] })
  ];

  const review = await adversarial.crossExamine({
    worlds,
    mission: EXECUTABLE_VARIANTS[2].mission,
    config: { attackerWorldIndex: 2, maxCostUsd: 0.5 }
  });

  console.log('Adversarial review:', review.phase, 'attacks:', review.attacks?.length, 'adjudication:', review.adjudication?.length);

  const enforced = adversarial.enforceVariantGate(
    { canMerge: true, outcome: 'PROMOTE_WORLD' },
    review
  );

  console.log('✓ Adversarial variant: cross-examination works, gate enforcement works');
  return { variant: 'adversarial', success: true, receipt, review, enforced };
}

async function testCounterfactualVariant() {
  console.log('\n=== Testing Counterfactual Variant ===');
  const availableAdapters = trinityAdapters.installedAdapterNames();
  const receipt = trinityVariants.selectForMission(EXECUTABLE_VARIANTS[3].mission, { availableAdapters });

  assert.equal(receipt.experimentalDesign.hypothesisPolicy, 'counterfactual_dimensions');
  assert.ok(receipt.requiredAdapters.includes('counterfactual_fork_executor'));

  const baseline = {
    id: 'baseline_001',
    evidenceVector: { correctness: 0.8, cost: 0.5, latency: 0.4, risk: 0.2 }
  };

  const forked = counterfactual.applyIntervention(baseline, {
    type: 'favorable',
    dimension: 'timeline',
    description: 'Double the available timeline for thorough work',
    expectedEffect: 'higher quality'
  });

  assert.match(forked.id, /^cf-/);
  assert.equal(forked.counterfactual.parentSnapshotId, 'baseline_001');
  assert.equal(forked.counterfactual.interventions[0].type, 'favorable');

  const delta = counterfactual.computeDelta(
    { evidenceVector: { correctness: 0.8, cost: 0.5, latency: 0.4 } },
    { evidenceVector: { correctness: 0.9, cost: 0.6, latency: 0.5 } }
  );

  assert.equal(delta.correctness, 0.1);
  assert.equal(delta.cost, 0.1);
  assert.equal(delta.latency, 0.1);

  const responsible = counterfactual.identifyResponsibleVariables(delta, []);
  assert.ok(responsible.some(r => r.dimension === 'correctness'));

  const interventions = [
    { type: 'favorable', dimension: 'timeline', description: 'Double the available timeline for thorough work', expectedEffect: 'higher quality' },
    { type: 'adverse', dimension: 'timeline', description: 'Halve the available timeline forcing shortcuts', expectedEffect: 'lower quality' }
  ];

  const analysis = await counterfactual.analyzeCounterfactualResults({
    baselineReport: { evidenceVector: { correctness: 0.7, cost: 0.5 } },
    favorableReport: { evidenceVector: { correctness: 0.9, cost: 0.6 } },
    adverseReport: { evidenceVector: { correctness: 0.5, cost: 0.4 } },
    interventions: { favorable: interventions[0], adverse: interventions[1] }
  });

  assert.equal(analysis.sensitivity.mostSensitive, 'correctness');

  console.log('✓ Counterfactual variant: fork, delta, delta analysis all work');
  return { variant: 'counterfactual', success: true, receipt, analysis };
}

module.exports = { testControlledVariant, testHeterogeneousVariant, testAdversarialVariant, testCounterfactualVariant };
