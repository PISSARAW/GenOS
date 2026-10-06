'use strict';
const { assert, crypto, trinity, trinityVariants, trinityAdapters, balanceVerifier, missionVerifier, counterfactual, adversarial, factorial, diversity, recursive, temporal, sequential, oracle, novelty, pareto, blindJury, trinityClaimVerification, modelRouter, EXECUTABLE_VARIANTS, FACTUAL_MISSIONS, makeReceipt, createWorldReport, leaf, node, canonicalTree } = require('./fixtures');

async function testAdaptiveVariant() {
  console.log('\n=== Testing Adaptive Variant ===');
  const availableAdapters = trinityAdapters.installedAdapterNames();
  const receipt = trinityVariants.selectForMission(EXECUTABLE_VARIANTS[8].mission, {
    availableAdapters,
    adaptiveBudgetConfig: { poolTokens: 300, minimumTokens: 10 }
  });

  assert.equal(receipt.experimentalDesign.replicationPolicy, 'adaptive_budget_fixed_replicas');
  assert.ok(receipt.requiredAdapters.includes('adaptive_budget_scheduler'));
  assert.ok(receipt.effects?.adaptiveBudget);

  const adaptiveBudget = require('../../src/services/trinityAdaptiveBudgetService');
  const workerIds = ['adaptive_1', 'adaptive_2', 'adaptive_3'];
  const results = [0.2, 0.5, 0.8].map((uncertainty, index) => ({
    agentId: workerIds[index], status: 'completed', payload: { evidenceReport: {
      evidenceVector: { uncertainty }, evidenceVectorEvidence: { uncertainty: ['uncertainty_measurement'] },
      evidence: [{ id: 'uncertainty_measurement', verificationReceipt: makeReceipt({ verifierName: 'uncertainty_verifier', status: 'verified', evidence: [uncertainty] }) }]
    } }
  }));
  const allocation = adaptiveBudget.allocate({ workerIds, results, pool: 300, minimumTokens: 10 });
  assert.ok(allocation);
  assert.equal(allocation.worlds.reduce((sum, world) => sum + world.tokens, 0), 300);
  assert.ok(allocation.worlds.every(world => world.tokens >= 10));
  assert.ok(allocation.worlds[2].tokens > allocation.worlds[0].tokens);

  console.log('✓ Adaptive variant: budget allocation works, uncertainty-based allocation works');
  return { variant: 'adaptive', success: true, receipt, allocation };
}

async function testTemporalVariant() {
  console.log('\n=== Testing Temporal Variant ===');
  const availableAdapters = trinityAdapters.installedAdapterNames();
  const receipt = trinityVariants.selectForMission(EXECUTABLE_VARIANTS[9].mission, { availableAdapters });

  assert.equal(receipt.experimentalDesign.temporalPolicy, 'short_medium_long');
  assert.ok(receipt.requiredAdapters.includes('temporal_value_model'));
  assert.ok(receipt.requiredAdapters.includes('temporal_value_model'));

  const report = {
    claims: [{ id: 'c1', statement: 'Deploy hotfix now for immediate relief', evidence: ['e1'], verificationLevel: 'verified', type: 'functional' }],
    uncertainties: ['long term maintenance cost unknown']
  };

  const short = temporal.analyzeTemporalWorld(report, 'short');
  assert.equal(short.horizon, 'short');
  assert.ok(short.temporalValue >= 0);
  assert.ok(short.temporalValue <= 1);

  const medium = temporal.analyzeTemporalWorld(report, 'medium');
  assert.equal(medium.horizon, 'medium');

  const long = temporal.analyzeTemporalWorld(report, 'long');
  assert.equal(long.horizon, 'long');

  const compared = temporal.compareTemporalWorlds([report, report, report], {});
  assert.deepEqual(compared.horizons, ['short', 'medium', 'long']);
  assert.ok('consistentWinner' in compared.synthesis);

  console.log('✓ Temporal variant: horizon analysis works, temporal comparison works');
  return { variant: 'temporal', success: true, receipt, short, medium, long, compared };
}

async function testOracularVariant() {
  console.log('\n=== Testing Oracular Variant ===');
  const availableAdapters = trinityAdapters.installedAdapterNames();
  const receipt = trinityVariants.selectForMission(EXECUTABLE_VARIANTS[10].mission, { availableAdapters });

  assert.equal(receipt.experimentalDesign.worldTopology, 'oracular_prediction');
  assert.equal(receipt.experimentalDesign.hypothesisPolicy, 'oracle_prediction');
  assert.ok(receipt.requiredAdapters.includes('oracular_executor'));
  assert.ok(receipt.requiredAdapters.includes('oracle_predictor'));

  const prediction = oracle.predictPerformance({ candidates: [{ id: 'w1' }, { id: 'w2' }, { id: 'w3' }] });
  const total = Object.values(prediction.distribution).reduce((sum, v) => sum + v, 0);
  assert.ok(Math.abs(total - 1) < 1e-9);
  assert.equal(prediction.advisoryOnly, true);
  assert.equal(prediction.decisionAuthority, 'none');

  const perfect = { prediction: { w1: 1, w2: 0, w3: 0 }, outcomes: { w1: 1, w2: 0, w3: 0 } };
  assert.equal(oracle.brierScore(perfect), 0);
  assert.ok(oracle.logLoss(perfect) < 1e-4);

  const scored = oracle.scorePrediction(perfect);
  assert.equal(scored.advisoryOnly, true);

  let history = oracle.recordCalibration({ history: [], ...perfect });
  assert.equal(history.length, 1);

  const weights = oracle.routingWeights({ history });
  assert.ok(weights.w1 > 0);

  console.log('✓ Oracular variant: prediction, scoring, calibration, routing all work');
  return { variant: 'oracular', success: true, receipt, prediction, scored, weights };
}

async function testExploratoryVariant() {
  console.log('\n=== Testing Exploratory Variant ===');
  const availableAdapters = trinityAdapters.installedAdapterNames();
  const receipt = trinityVariants.selectForMission(EXECUTABLE_VARIANTS[11].mission, {
    availableAdapters,
    qdConfig: { replicaBudget: 3, tokensPerReplica: 100 }
  });

  assert.equal(receipt.experimentalDesign.hypothesisPolicy, 'novelty_seeking');
  assert.equal(receipt.experimentalDesign.replicationPolicy, 'quality_diversity_replicas');
  assert.ok(receipt.requiredAdapters.includes('novelty_archive'));
  assert.ok(receipt.requiredAdapters.includes('novelty_archive'));
  assert.ok(receipt.requiredAdapters.includes('qd_replica_scheduler'));
  assert.ok(receipt.effects?.requiresQDReplicas);

  let archive = [];
  const vectors = [[0, 0], [0.1, 0], [0, 0.1], [1, 1]];
  for (const v of vectors) {
    const score = novelty.noveltyScore({ archive, vector: v });
    archive = novelty.addBehavior({ archive, id: `b_${v.join('_')}`, vector: v, quality: 0.5 });
  }

  assert.equal(archive.length, 4);
  const near = novelty.noveltyScore({ archive, vector: [0.05, 0.05] });
  const far = novelty.noveltyScore({ archive, vector: [1, 1] });
  assert.ok(near < 1);
  assert.ok(far > near);

  const selected = novelty.qualityDiversitySelect({
    candidates: [
      { id: 'c1', vector: [0.05, 0.05], quality: 0.9 },
      { id: 'c2', vector: [0.9, 0.9], quality: 0.8 },
      { id: 'c3', vector: [0.06, 0.06], quality: 0.1 }
    ],
    archive, nicheCount: 4
  });

  assert.equal(selected.antiConvergence, true);
  assert.ok(selected.nichesCovered >= 1);

  const scheduled = novelty.scheduleReplicas({ niches: ['n1', 'n2'], replicaBudget: 3, populatedNiches: { n1: 5 } });
  assert.equal(scheduled.replicas[0].targetNiche, 'n2');
  assert.equal(scheduled.totalReplicas, 3);

  console.log('✓ Exploratory variant: novelty scoring, archive, QD selection, replica scheduling all work');
  return { variant: 'exploratory', success: true, receipt, archive, selected, scheduled };
}

module.exports = { testAdaptiveVariant, testTemporalVariant, testOracularVariant, testExploratoryVariant };
