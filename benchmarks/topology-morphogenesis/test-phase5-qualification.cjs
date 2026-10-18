'use strict';

const assert = require('node:assert/strict');
const gate = require('./../../backend/src/services/morphogenesis/synthesis/pairedCampaignGate');
const { qualifyConfirmatoryCampaign } = require('./phase5Qualification.cjs');

const CONDITIONS = gate.REQUIRED_CONDITIONS;
const EXTERNAL = { 'langgraph-static': 'langgraph', 'autogen-graphflow-swarm': 'autogen-graphflow', 'mass-evomas': 'mass' };
const PLAN = { alpha: 0.05, bootstrapSamples: 1000, minShadowPairs: 1, minHoldoutPairs: 10,
  minEffect: 0.05, maxCostOverhead: 0.1, seed: 20261018, multiplicityCorrection: 'bonferroni' };

function manifest() {
  return { campaignId: 'phase5-qualification', status: 'preregistered', registeredAt: '2026-10-18T09:00:00.000Z',
    statisticalPlan: PLAN, statisticalPlanHash: gate.hashStatisticalPlan(PLAN), datasets: {
      shadow: { datasetId: 'shadow-v1', sha256: `sha256:${'a'.repeat(64)}` },
      holdout: { datasetId: 'holdout-v1', sha256: `sha256:${'b'.repeat(64)}`, sealedAt: '2026-10-18T08:00:00.000Z', selectorAccess: false }
    }, execution: { modelId: 'model-v1', budgetTokens: 100, latencyBudgetMs: 1000,
      toolPolicyHash: 'sha256:tools', environmentHash: 'sha256:environment' } };
}

function row(split, index, conditionId) {
  const external = EXTERNAL[conditionId];
  const adaptive = conditionId === 'genos-adaptive';
  return { split, conditionId, taskId: `${split}-${index}`, taskFamily: `${split}-family-${index}`, seed: 100 + index,
    datasetId: `${split}-v1`, modelId: 'model-v1', budgetTokens: 100, latencyBudgetMs: 1000,
    oracleId: `${split}-oracle-${index}`, oracleSha256: `sha256:${'c'.repeat(64)}`, toolPolicyHash: 'sha256:tools',
    environmentHash: 'sha256:environment', evidenceRef: `attempt:${split}-${index}-${conditionId}`, score: adaptive ? 1 : 0,
    cost: adaptive ? 0.01 : 0, budgetExceeded: false, oracleVerified: true, executionVerified: true,
    realExecution: true, provenance: external ? 'external-paired' : conditionId === 'single-agent' ? 'local-baseline' : 'local-runtime',
    framework: external || conditionId, adapterVersion: 'v1', observedAt: '2026-10-18T10:00:00.000Z' };
}

function observations() {
  return [...Array.from({ length: 1 }, (_, index) => index), ...Array.from({ length: 10 }, (_, index) => index)]
    .flatMap((index, position) => { const split = position === 0 ? 'shadow' : 'holdout'; return CONDITIONS.map(condition => row(split, index, condition)); });
}

function run() {
  const input = { manifest: manifest(), observations: observations(), phase: 'holdout', sourceClean: true,
    externalAdaptersVerified: true, mechanismEvidenceVerified: true, trainHoldoutDisjoint: true,
    requiredRepetitions: 1, performedRepetitions: 1 };
  const qualified = qualifyConfirmatoryCampaign(input);
  assert.equal(qualified.status, 'qualified');
  assert.equal(qualified.causalAdvantage, true);
  assert.equal(qualified.universalGeneralization, false);
  assert.equal(qualified.runtimePromotionAuthorized, false);
  assert.ok(qualified.conditionSummary.some(row => row.conditionId === 'genos-adaptive' && row.attemptCount === 11));

  const blocked = qualifyConfirmatoryCampaign({ ...input, sourceClean: false, externalAdaptersVerified: false });
  assert.equal(blocked.status, 'blocked');
  assert.ok(blocked.blockers.includes('source_tree_dirty'));
  assert.ok(blocked.blockers.includes('external_adapters_unverified'));
  console.log('Phase 5 confirmatory qualification and bounded reporting: PASS');
}

run();
