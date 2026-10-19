'use strict';

const assert = require('node:assert/strict');
const { open } = require('sqlite');
const sqlite3 = require('sqlite3');
const { migrateAdaptiveState } = require('../src/db/migrations/migrateAdaptiveState');
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
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  try {
    await migrateAdaptiveState(db);
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
  } finally {
    await db.close();
  }
}

main().then(() => console.log('Counterfactual world planning tests passed.'))
  .catch((error) => { console.error(error); process.exitCode = 1; });
