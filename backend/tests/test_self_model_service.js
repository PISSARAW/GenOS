const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
process.env.GENOS_ADMIN_PASSWORD = process.env.GENOS_ADMIN_PASSWORD || 'self-model-test-only';
const { getDatabase, closeDatabase } = require('../src/db');
const selfModel = require('../src/services/selfModelService');

async function run() {
  const dbPath = path.resolve(__dirname, 'test-self-model.db');
  if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
  const db = await getDatabase(dbPath);
  try {
    await db.run("INSERT INTO agents (id, name, role, status, execution_mode) VALUES ('self-model-agent', 'Self Model', 'Project Orchestrator', 'idle', 'orchestrator')");
    await db.run("INSERT INTO strategy_contracts (id, agent_id, version, primary_strategy, contract_hash, contract_json) VALUES ('self-model-contract', 'self-model-agent', 1, 'falsification_forks', 'test-hash', '{}')");
    await db.run("INSERT INTO strategy_execution_runs (id, agent_id, contract_id, contract_version, status, budget_json, metrics_json, guardrail_reason) VALUES ('self-model-run', 'self-model-agent', 'self-model-contract', 1, 'completed', ?, ?, 'evidence debt')", JSON.stringify({ tokens: 100 }), JSON.stringify({ tokens: 160, workersSpawned: 5, evidenceScore: 0.2 }));
    await selfModel.calibrate(db, 'self-model-run');
    const plan = { profile: { uncertainty: 0.8 }, tokenPolicy: { total: 10000 }, workers: [{}, {}, {}], dispatchWorkers: [{}, {}, {}], survival: { constraints: {} } };
    const mission = { executionBudget: { tokens: 10000 } };
    const model = await selfModel.load(db, 'self-model-agent', { mission, plan });
    selfModel.applyToMission(mission, model, plan);
    assert.equal(model.schema, 'genos.orchestrator-self-model/v1alpha1');
    assert(model.habits.knownWeaknesses.includes('over-delegates when uncertainty is high'));
    assert.equal(plan.survival.constraints.maxWorkerFanout, 2);
    assert.equal(mission.requiresReplayBeforePromotion, true);
    assert.throws(
      () => selfModel.assertPromotionConstraints(model, { report: { claims: [{ evidence: ['test'] }] } }),
      { code: 'SELF_MODEL_REPLAY_REQUIRED' }
    );
    assert.equal(model.calibration.observations, 1);
    const repeatedCalibration = await selfModel.calibrate(db, 'self-model-run');
    assert.equal(repeatedCalibration.observations, 1);
    console.log('Self-model persistence, calibration, and decision constraints passed.');
  } finally {
    await closeDatabase();
    for (const suffix of ['', '-shm', '-wal']) if (fs.existsSync(dbPath + suffix)) fs.unlinkSync(dbPath + suffix);
  }
}

run().catch((error) => { console.error(error); process.exit(1); });
