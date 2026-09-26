'use strict';

const assert = require('node:assert/strict');
const variants = require('../src/services/trinityVariantService');
const adapters = require('../src/services/trinityAdapters');
const factorial = require('../src/services/trinityFactorialGrid');
const diversity = require('../src/services/trinityDiversityPlanner');
const counterfactual = require('../src/services/trinityCounterfactualFork');
const recursive = require('../src/services/trinityRecursiveExecutor');
const temporal = require('../src/services/trinityTemporalHorizons');
const sequential = require('../src/services/trinityAdaptiveSequential');
const adversarial = require('../src/services/trinityAdversarialCrossExamination');
const oracle = require('../src/services/trinityOracle');
const novelty = require('../src/services/trinityNoveltyArchive');

const VARIANT_IDS = ['controlled', 'heterogeneous', 'adversarial', 'counterfactual', 'factorial',
  'pareto', 'jury', 'recursive', 'adaptive', 'temporal', 'oracular', 'exploratory'];

function testVariantSurface() {
  assert.deepEqual(Object.keys(variants.DEFINITIONS).sort(), [...VARIANT_IDS].sort());
  for (const id of VARIANT_IDS) {
    const definition = variants.DEFINITIONS[id];
    assert.ok(definition.signals, `${id} signals`);
    const compiled = variants.compileExperimentalDesign(definition.design);
    assert.equal(compiled.maturity, 'implemented', `${id} maturity`);
    for (const [axis, value] of Object.entries(definition.design)) {
      assert.equal(compiled.design[axis], value, `${id} axis ${axis} preserved`);
    }
  }
}

function testControlledBaseline() {
  const receipt = variants.selectForMission('Compare three sorting implementations.', { variantId: 'controlled' });
  assert.equal(receipt.variant, 'controlled');
  assert.equal(receipt.topology, 'trinity');
  assert.equal(receipt.maturity, 'implemented');
  assert.match(receipt.experimentalDesignId, /^trinity-design-v1-[0-9a-f]{16}$/);
  assert.deepEqual(receipt.experimentalDesign, variants.DEFAULT_DESIGN);
}

function testExplicitReceipts() {
  for (const id of VARIANT_IDS) {
    const options = id === 'jury'
      ? { variantId: id, trinityJury: { enabled: true, modelUris: ['a', 'b'], maxCostUsd: 1 } }
      : { variantId: id };
    const receipt = variants.selectForMission(`Mission for ${id}.`, options);
    assert.equal(receipt.variant, id);
    assert.ok(receipt.experimentalDesignId);
  }
}

function testAdapterGating() {
  assert.throws(() => variants.selectForMission('Factorial mission.', { variantId: 'factorial', availableAdapters: [] }),
    (error) => error.code === 'TRINITY_DESIGN_ADAPTER_MISSING');
  assert.throws(() => variants.selectForMission('Jury mission.', { variantId: 'jury' }),
    (error) => error.code === 'TRINITY_VARIANT_PRECONDITION_MISSING');
  assert.throws(() => variants.selectForMission('Nope.', { variantId: 'unknown-variant' }),
    (error) => error.code === 'TRINITY_VARIANT_UNKNOWN');
}

function testAdapterRegistry() {
  const names = adapters.adapterNames();
  assert.ok(names.length >= 20);
  assert.deepEqual(adapters.installedAdapterNames().sort(), names.sort());
  assert.equal(adapters.resolveAdapter('diversity_planner').MIN_DIVERSITY_THRESHOLD, 0.6);
  assert.throws(() => adapters.resolveAdapter('no_such_adapter'), (error) => error.code === 'TRINITY_ADAPTER_UNKNOWN');
  assert.throws(() => adapters.describeAdapter('no_such_adapter'), (error) => error.code === 'TRINITY_ADAPTER_UNKNOWN');
  const described = adapters.describeAdapter('factorial_grid_executor');
  assert.equal(described.module, './trinityFactorialGrid');
  assert.ok(described.functions.includes('anovaAnalysis'));
}

function testFactorialGrid() {
  const grid = factorial.generateFactorialGrid({
    factors: { strategy: ['direct', 'structured'], model: ['a', 'b'] },
    replications: 2, randomize: false, seed: 's1'
  });
  assert.equal(grid.totalCells, 8);
  assert.equal(grid.cells.filter((cell) => cell.replication === 0).length, 4);
  const results = grid.cells.map((cell, index) => ({
    factors: cell.factors, replication: cell.replication, score: (index % 4) / 4
  }));
  const anova = factorial.anovaAnalysis(results, grid.factorLevels);
  assert.ok(anova.fStat >= 0);
  assert.equal(Object.keys(anova.cellMeans).length, 4);
  const model = factorial.hierarchicalModel(results, grid.factorLevels);
  assert.ok(model.mainEffects.strategy);
  assert.ok(model.interactions['strategy×model']);
  const corrected = factorial.varianceCorrection(results, { randomize: true });
  assert.equal(corrected.corrected, true);
  assert.equal(factorial.varianceCorrection(results, grid).corrected, false);
}

function testDiversityPlanner() {
  const worlds = [
    { provider: 'openai', modelFamily: 'gpt-4o', cognitiveRecipe: 'direct', tools: ['a'], lineage: 'x/1', agentId: 'w1' },
    { provider: 'anthropic', modelFamily: 'claude-3-5', cognitiveRecipe: 'adversarial', tools: ['b'], lineage: 'y/2', agentId: 'w2' },
    { provider: 'local', modelFamily: 'llama', cognitiveRecipe: 'novelty_seeking', tools: ['c'], lineage: 'z/3', agentId: 'w3' }
  ];
  const planned = diversity.planDiverseWorlds({ candidates: worlds });
  assert.equal(planned.success, true);
  assert.ok(planned.experimentalDesignId.startsWith('diversity-plan-v1-'));
  assert.equal(diversity.validateDiversity(worlds).valid, true);
  const homogeneous = [worlds[0], { ...worlds[0] }, { ...worlds[0] }];
  assert.equal(diversity.validateDiversity(homogeneous).valid, false);
  assert.equal(diversity.enforceProviderDiversity(worlds).valid, true);
  assert.equal(diversity.enforceProviderDiversity(homogeneous).valid, false);
}

function testCounterfactual() {
  const baseline = { id: 'snap0', evidenceVector: { correctness: 0.8 } };
  const forked = counterfactual.applyIntervention(baseline, { type: 'favorable', dimension: 'timeline' });
  assert.match(forked.id, /^cf-/);
  assert.equal(forked.counterfactual.parentSnapshotId, 'snap0');
  const delta = counterfactual.computeDelta(
    { evidenceVector: { correctness: 0.8, cost: 0.5 } },
    { evidenceVector: { correctness: 0.9, cost: 0.5 } });
  assert.equal(delta.correctness, 0.1);
  assert.equal(delta.cost, 0);
  const responsible = counterfactual.identifyResponsibleVariables(delta, []);
  assert.equal(responsible[0].dimension, 'correctness');
}

async function testCounterfactualRun() {
  const interventions = [
    { type: 'favorable', dimension: 'timeline', description: 'Double the available timeline for thorough work', expectedEffect: 'higher quality' },
    { type: 'adverse', dimension: 'timeline', description: 'Halve the available timeline forcing shortcuts', expectedEffect: 'lower quality' }
  ];
  const run = await counterfactual.runCounterfactualTrinity({ mission: 'Ship it.', baselineWorlds: [{}], config: { interventions } });
  assert.ok(run.worldMissions.favorable.includes('FAVORABLE'));
  assert.ok(run.worldMissions.adverse.includes('ADVERSE'));
  const analysis = await counterfactual.analyzeCounterfactualResults({
    baselineReport: { evidenceVector: { correctness: 0.7 } },
    favorableReport: { evidenceVector: { correctness: 0.9 } },
    adverseReport: { evidenceVector: { correctness: 0.5 } },
    interventions: { favorable: interventions[0], adverse: interventions[1] }
  });
  assert.equal(analysis.sensitivity.mostSensitive, 'correctness');
}

function testRecursiveGuards() {
  const subProblem = { id: 'sub1', parentClaimId: 'c1' };
  assert.equal(recursive.shouldRecurse({ subProblem, config: {}, depth: 3, spentBudget: 0 }).reason, 'max_depth_reached');
  assert.equal(recursive.shouldRecurse({ subProblem, config: {}, depth: 0, spentBudget: 1 }).reason, 'budget_exhausted');
  assert.equal(recursive.shouldRecurse({ subProblem, config: { parentProblemIds: ['sub1'] }, depth: 0, spentBudget: 0 }).reason, 'cycle_detected');
  assert.equal(recursive.shouldRecurse({ subProblem, config: {}, depth: 0, spentBudget: 0 }).allow, true);
  const report = { claims: [{ id: 'c1', statement: 'X holds', falsificationCriteria: ['try Y'], verificationLevel: 'unverified' }], uncertainties: [] };
  const found = recursive.identifySubProblems(report);
  assert.equal(found.length, 1);
  assert.equal(found[0].severity, 'high');
  const mission = recursive.buildRecursiveMission('Do X.', found[0], { uncertainty: 0.4 });
  assert.match(mission, /RECURSIVE SUB-PROBLEM/);
}

function testTemporalHorizons() {
  const report = {
    claims: [{ id: 'c1', statement: 'Deploy hotfix now for immediate relief', evidence: ['e1'], verificationLevel: 'verified', type: 'functional' }],
    uncertainties: ['long term maintenance cost unknown']
  };
  const short = temporal.analyzeTemporalWorld(report, 'short');
  assert.equal(short.horizon, 'short');
  assert.ok(short.temporalValue >= 0);
  const compared = temporal.compareTemporalWorlds([report, report], {});
  assert.deepEqual(compared.horizons, ['short', 'medium', 'long']);
  assert.ok('consistentWinner' in compared.synthesis);
}

function testSequentialAllocation() {
  const arms = sequential.initializeArms([{ id: 'w1' }, { id: 'w2' }, { id: 'w3' }]);
  const first = sequential.sequentialAllocate({ arms, totalBudget: 10, spentBudget: 0, config: {} });
  assert.equal(first.reason, 'minimum_replicas');
  for (const arm of arms) { arm.pulls = 2; arm.meanReward = 0.6; }
  const second = sequential.sequentialAllocate({ arms, totalBudget: 10, spentBudget: 3, config: { seed: 'det' } });
  assert.equal(second.reason, 'thompson_sampling');
  assert.ok(second.selectedArm);
  assert.equal(sequential.sequentialAllocate({ arms, totalBudget: 3, spentBudget: 3, config: {} }).reason, 'budget_exhausted');
  const stop = sequential.stoppingRule(arms, { maxTotalReplicas: 6 });
  assert.equal(stop.stop, true);
  assert.ok(sequential.computeBiasCorrectedEstimate(arms) !== null);
}

function testAdversarialAdjudication() {
  const attacks = [{ id: 'a1', targetWorld: 1, severity: 'major' }];
  const conceded = adversarial.adjudicate(attacks, [{ attackId: 'a1', response: 'concede' }], null);
  assert.equal(conceded[0].verdict, 'conceded');
  const refuted = adversarial.adjudicate(attacks,
    [{ attackId: 'a1', response: 'refute', evidence: ['e1'] }],
    [{ passes: () => true }]);
  assert.equal(refuted[0].verdict, 'refuted');
  const standing = adversarial.adjudicate(attacks, [], null);
  assert.equal(standing[0].verdict, 'attack_stands');
}

async function testAdversarialShape() {
  await assert.rejects(adversarial.crossExamine({ worlds: [], mission: 'x' }), /exactly 3/);
}

function testOracle() {
  const prediction = oracle.predictPerformance({ candidates: [{ id: 'w1' }, { id: 'w2' }] });
  const total = Object.values(prediction.distribution).reduce((sum, value) => sum + value, 0);
  assert.ok(Math.abs(total - 1) < 1e-9);
  assert.equal(prediction.advisoryOnly, true);
  assert.equal(prediction.decisionAuthority, 'none');
  const perfect = { prediction: { w1: 1, w2: 0 }, outcomes: { w1: 1, w2: 0 } };
  assert.equal(oracle.brierScore(perfect), 0);
  assert.ok(oracle.logLoss(perfect) < 1e-4);
  const scored = oracle.scorePrediction(perfect);
  assert.equal(scored.advisoryOnly, true);
  let history = oracle.recordCalibration({ history: [], ...perfect });
  assert.equal(history.length, 1);
  const weights = oracle.routingWeights({ history });
  assert.ok(weights.w1 > 0);
  assert.throws(() => oracle.predictPerformance({ candidates: [] }), (error) => error.code === 'TRINITY_ORACLE_NO_CANDIDATES');
}

function testNoveltyArchive() {
  assert.equal(novelty.noveltyScore({ archive: [], vector: [1, 2] }), 1);
  let archive = novelty.addBehavior({ archive: [], id: 'b1', vector: [0, 0], quality: 0.9 });
  archive = novelty.addBehavior({ archive, id: 'b2', vector: [0.1, 0], quality: 0.2 });
  archive = novelty.addBehavior({ archive, id: 'b3', vector: [0, 0.1], quality: 0.5 });
  assert.equal(archive.length, 3);
  const near = novelty.noveltyScore({ archive, vector: [0.05, 0.05] });
  const far = novelty.noveltyScore({ archive, vector: [50, 50] });
  assert.ok(near < 1);
  assert.ok(far > near);
  const selected = novelty.qualityDiversitySelect({
    candidates: [
      { id: 'c1', vector: [0.05, 0.05], quality: 0.9 },
      { id: 'c2', vector: [9, 9], quality: 0.8 },
      { id: 'c3', vector: [0.06, 0.06], quality: 0.1 }
    ],
    archive, nicheCount: 4
  });
  assert.equal(selected.antiConvergence, true);
  assert.ok(selected.nichesCovered >= 1);
  assert.ok(selected.selection[0].combined >= selected.selection[selected.selection.length - 1].combined);
  const scheduled = novelty.scheduleReplicas({ niches: ['n1', 'n2'], replicaBudget: 3, populatedNiches: { n1: 5 } });
  assert.equal(scheduled.replicas[0].targetNiche, 'n2');
  assert.equal(scheduled.totalReplicas, 3);
}

function testJuryParetoAdaptersResolve() {
  assert.ok(adapters.resolveAdapter('blind_jury_adjudicator'));
  assert.ok(adapters.resolveAdapter('pareto_objective_assigner'));
  assert.ok(adapters.resolveAdapter('adaptive_budget_scheduler'));
}

async function main() {
  testVariantSurface();
  testControlledBaseline();
  testExplicitReceipts();
  testAdapterGating();
  testAdapterRegistry();
  testFactorialGrid();
  testDiversityPlanner();
  testCounterfactual();
  await testCounterfactualRun();
  testRecursiveGuards();
  testTemporalHorizons();
  testSequentialAllocation();
  testAdversarialAdjudication();
  await testAdversarialShape();
  testOracle();
  testNoveltyArchive();
  testJuryParetoAdaptersResolve();
  console.log('✅ Trinity variant tests passed.');
}

main().catch((error) => { console.error(error); process.exit(1); });
