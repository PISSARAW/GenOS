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

async function testTemporalVariant() {
  console.log('\n=== Testing Temporal Variant ===');
  const availableAdapters = trinityAdapters.installedAdapterNames();
  const receipt = trinityVariants.selectForMission(EXECUTABLE_VARIANTS[9].mission, { availableAdapters });

  assert.equal(receipt.experimentalDesign.temporalPolicy, 'short_medium_long');
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
  assert.ok(receipt.requiredAdapters.includes('qd_replica_scheduler'));
  assert.ok(receipt.effects?.requiresQDReplicas);

  let archive = [];
  const vectors = [[0, 0], [0.1, 0], [0, 0.1], [50, 50]];
  for (const v of vectors) {
    const score = novelty.noveltyScore({ archive, vector: v });
    archive = novelty.addBehavior({ archive, id: `b_${v.join('_')}`, vector: v, quality: 0.5 });
  }

  assert.equal(archive.length, 4);
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

  const scheduled = novelty.scheduleReplicas({ niches: ['n1', 'n2'], replicaBudget: 3, populatedNiches: { n1: 5 } });
  assert.equal(scheduled.replicas[0].targetNiche, 'n2');
  assert.equal(scheduled.totalReplicas, 3);

  console.log('✓ Exploratory variant: novelty scoring, archive, QD selection, replica scheduling all work');
  return { variant: 'exploratory', success: true, receipt, archive, selected, scheduled };
}

module.exports = { testTemporalVariant, testOracularVariant, testExploratoryVariant };
