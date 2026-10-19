'use strict';

const assert = require('node:assert/strict');
const { migrateAdaptiveState } = require('../src/db/migrations/migrateAdaptiveState');
const fixture = require('./ontogenesisFixture');
const projectStore = require('../src/services/ontogenesis/projectStore');
const { registerResponsibility } = require('../src/services/shev/responsibilityService');
const evolution = require('../src/services/counterfactualWorldEvolutionService');

function input() {
  return { planId: 'web-plan-1', projectId: 'project-web', plannerAgentId: 'planner-web',
    horizon: '2026-11-01T00:00:00.000Z',
    baseline: { evidenceRef: 'observation:web:baseline', metric: 'conversion_rate',
      value: 0.2, observedAt: '2026-10-19T10:00:00.000Z' },
    candidates: [
      { id: 'conservative', action: 'change-copy', metric: 'conversion_rate',
        horizon: '2026-11-01T00:00:00.000Z', predictedValue: 0.24,
        predictedProbability: 0.7, risk: 0.1, cost: 10, requiredPermission: 'diagnose' },
      { id: 'ambitious', action: 'change-flow', metric: 'conversion_rate',
        horizon: '2026-11-01T00:00:00.000Z', predictedValue: 0.3,
        predictedProbability: 0.55, risk: 0.35, cost: 40, requiredPermission: 'instrument' }
    ], now: '2026-10-19T10:01:00.000Z' };
}

async function main() {
  const db = await fixture.memoryDb();
  try {
    await migrateAdaptiveState(db);
    await projectStore.createProject(db, { id: 'project-web', rootPath: 'C:/world-evolution',
      branch: 'codex/world-evolution', objective: 'Évaluer des actions web',
      config: fixture.testConfig() });
    await registerResponsibility(db, { projectId: 'project-web',
      authorityRef: 'delegation:web-owner', mandate: { purpose: 'Faire évoluer le produit web',
        autoDiagnose: true, autoInstrument: false,
        dimensions: [{ name: 'conversion_rate', expected: 'increase',
          acceptance: ['independent real observation'] }] } });
    const plan = await evolution.planScenarios(db, input());
    assert.equal(plan.status, 'synthetic_only');
    assert.equal(plan.promotionAllowed, false);
    assert.equal(plan.requiredNextEvidence, 'independent_real_observation');
    assert.equal(new Set(plan.branches.map((branch) => branch.isolationNamespace)).size, 2);
    for (const branch of plan.branches) {
      assert.equal(branch.synthetic, true);
      assert.equal(branch.realityMode, 'counterfactual');
      assert.equal(branch.promotionAllowed, false);
      assert.equal(branch.prediction.metric, plan.baseline.metric);
      assert.equal(branch.prediction.horizon, plan.horizon);
    }
    const { AdaptiveStateService } = require('../src/services/adaptiveStateService');
    const stored = await new AdaptiveStateService(db)
      .restoreObject(evolution.SCOPE, 'project-web');
    assert.equal(stored.plans[0].planId, plan.planId);
    const invalid = input();
    invalid.candidates[1].metric = 'latency_ms';
    await assert.rejects(evolution.planScenarios(db, invalid), /share the baseline metric/);
    const decision = await evolution.decideAction(db, { projectId: 'project-web',
      planId: plan.planId, policy: { maxRisk: 0.4, maxCost: 100,
        riskWeight: 0.01, costWeight: 0.005, minUtility: 0 } });
    assert.equal(decision.outcome, 'PROPOSE_ACTION');
    assert.equal(decision.selectedBranchId, 'conservative');
    assert.equal(decision.promotionAllowed, false);
    assert.equal(decision.responsibility.authorityRef, 'delegation:web-owner');
    assert.equal(decision.responsibility.mandateVersion, 1);
    assert.equal(decision.evaluations.find((item) => item.branchId === 'ambitious').permitted, false);
    const abstention = await evolution.decideAction(db, { projectId: 'project-web',
      planId: plan.planId, policy: { maxRisk: 0, maxCost: 1,
        riskWeight: 1, costWeight: 1, minUtility: 0 } });
    assert.equal(abstention.outcome, 'ABSTAIN');
  } finally {
    await db.close();
  }
}

main().then(() => console.log('Counterfactual world planning tests passed.'))
  .catch((error) => { console.error(error); process.exitCode = 1; });
