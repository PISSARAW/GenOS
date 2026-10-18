'use strict';

const assert = require('node:assert/strict');
const gate = require('../src/services/morphogenesis/synthesis/pairedCampaignGate');
const protocol = require('../../benchmarks/topology-morphogenesis/p2-protocol.json');

const PLAN = Object.freeze({ alpha: 0.05, bootstrapSamples: 1200,
  minShadowPairs: 3, minHoldoutPairs: 10, minEffect: 0.05,
  maxCostOverhead: 0.1, seed: 20261018, multiplicityCorrection: 'bonferroni' });

function manifest(overrides = {}) {
  const { statisticalPlan: planOverrides = {}, ...manifestOverrides } = overrides;
  const statisticalPlan = { ...PLAN, ...planOverrides };
  return { campaignId: 'morphogenesis-p2-campaign', status: 'preregistered',
    registeredAt: '2026-10-18T08:00:00.000Z', statisticalPlan,
    statisticalPlanHash: gate.hashStatisticalPlan(statisticalPlan),
    datasets: { shadow: { datasetId: 'shadow-v1', sha256: `sha256:${'a'.repeat(64)}` },
      holdout: { datasetId: 'holdout-v1', sha256: `sha256:${'b'.repeat(64)}`,
        sealedAt: '2026-10-18T07:00:00.000Z', selectorAccess: false } },
    ...manifestOverrides };
}

function externalIdentity(conditionId) {
  const frameworks = { 'langgraph-static': 'langgraph',
    'autogen-graphflow-swarm': 'autogen-graphflow', 'mass-evomas': 'evomas' };
  return frameworks[conditionId] ? { provenance: 'external-paired',
    framework: frameworks[conditionId], adapterVersion: 'fixture-v1' }
    : { provenance: conditionId === gate.ADAPTIVE_CONDITION ? 'local-runtime' : 'local-baseline' };
}

function scoreFor(conditionId, split, negativeHoldout) {
  if (conditionId !== gate.ADAPTIVE_CONDITION) return 0.5;
  return split === 'holdout' && negativeHoldout ? 0.4 : 0.9;
}

function observation(options) {
  const { split, index, conditionId } = options;
  const leak = options.leak === true && split === 'holdout' && index === 0;
  const prefix = leak ? 'shadow' : split;
  return { split, conditionId, taskId: `${prefix}-task-${index}`,
    taskFamily: `${prefix}-family-${index}`, seed: index, datasetId: `${split}-v1`,
    modelId: 'model-v1', budgetTokens: 1000, latencyBudgetMs: 60000,
    oracleId: `${split}-oracle-${index}`, oracleSha256: `sha256:${'c'.repeat(64)}`,
    toolPolicyHash: 'tools:none', environmentHash: 'environment:frozen',
    score: scoreFor(conditionId, split, options.negativeHoldout), cost: conditionId === gate.ADAPTIVE_CONDITION ? 0.2 : 0.15,
    budgetExceeded: false, oracleVerified: true, executionVerified: true,
    evidenceRef: `receipt:${split}:${index}:${conditionId}`,
    observedAt: '2026-10-18T09:00:00.000Z', realExecution: true,
    ...externalIdentity(conditionId) };
}

function campaign(options = {}) {
  const observations = [];
  for (const [split, count] of [['shadow', 3], ['holdout', 12]]) {
    for (let index = 0; index < count; index += 1) {
      for (const conditionId of gate.REQUIRED_CONDITIONS) {
        if (options.missingCondition === conditionId && split === 'holdout' && index === 0) continue;
        observations.push(observation({ split, index, conditionId,
          negativeHoldout: options.negativeHoldout, leak: options.leak }));
      }
    }
  }
  if (options.badExternalProvenance) {
    const target = observations.find(row => row.conditionId === 'langgraph-static');
    target.provenance = 'local-baseline';
  }
  return { manifest: manifest(options.manifestOverrides), observations };
}

function testEligibleCampaignIsDeterministicAndNonAuthorizing() {
  const input = campaign();
  const first = gate.evaluatePairedCampaign(input);
  const replay = gate.evaluatePairedCampaign(input);
  assert.deepEqual(replay, first);
  assert.equal(first.status, 'eligible');
  assert.equal(first.adaptiveCommitEligible, true);
  assert.equal(first.commitAuthorized, false);
  assert.equal(first.executionAuthorized, false);
  assert.equal(first.comparisons.length, 5);
  assert.ok(first.comparisons.every(item => item.passed && item.pairCount === 12));
}

function testPublishedProtocolMatchesExecutableGate() {
  assert.deepEqual(protocol.requiredConditions.map(item => item.id), gate.REQUIRED_CONDITIONS);
  assert.equal(protocol.statisticalPlanHash, gate.hashStatisticalPlan(protocol.statisticalPlan));
  assert.equal(protocol.authority.commitAuthorized, false);
  assert.equal(protocol.status, 'contract-ready-execution-blocked');
}

function testEveryRivalAndRealExternalExecutionAreRequired() {
  const missing = gate.evaluatePairedCampaign(campaign({ missingCondition: 'mass-evomas' }));
  assert.equal(missing.status, 'blocked');
  assert.ok(missing.reasons.includes('incomplete_or_unpaired_blocks'));
  const simulated = gate.evaluatePairedCampaign(campaign({ badExternalProvenance: true }));
  assert.equal(simulated.status, 'blocked');
  assert.ok(simulated.reasons.includes('invalid_observations'));
}

function testShadowHoldoutLeakageAndPlanMutationAreRefused() {
  const leaked = gate.evaluatePairedCampaign(campaign({ leak: true }));
  assert.equal(leaked.status, 'blocked');
  assert.ok(leaked.reasons.includes('shadow_holdout_task_leakage'));
  assert.ok(leaked.reasons.includes('shadow_holdout_family_leakage'));
  const input = campaign();
  input.manifest.statisticalPlan.minEffect = 0;
  const mutated = gate.evaluatePairedCampaign(input);
  assert.equal(mutated.status, 'blocked');
  assert.ok(mutated.reasons.includes('statistical_plan_hash_mismatch'));
  const malformed = campaign();
  malformed.manifest.statisticalPlan.alpha = Number.NaN;
  const safelyBlocked = gate.evaluatePairedCampaign(malformed);
  assert.equal(safelyBlocked.status, 'blocked');
  assert.ok(safelyBlocked.reasons.includes('invalid_alpha'));
  assert.deepEqual(safelyBlocked.comparisons, []);
}

function testPositiveShadowCannotRescueNegativeHoldout() {
  const result = gate.evaluatePairedCampaign(campaign({ negativeHoldout: true }));
  assert.equal(result.status, 'blocked');
  assert.ok(result.reasons.includes('adaptive_does_not_clear_all_rivals'));
  assert.ok(result.comparisons.every(item => item.passed === false));
}

function main() {
  testPublishedProtocolMatchesExecutableGate();
  testEligibleCampaignIsDeterministicAndNonAuthorizing();
  testEveryRivalAndRealExternalExecutionAreRequired();
  testShadowHoldoutLeakageAndPlanMutationAreRefused();
  testPositiveShadowCannotRescueNegativeHoldout();
  process.stdout.write('morphology search P2 tests passed\n');
}

main();
