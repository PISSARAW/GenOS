const assert = require('assert');
const fs = require('fs');
const path = require('path');
const contracts = require('../src/services/strategyContractService');
const execution = require('../src/services/strategyExecutionService');
const adaptation = require('../src/services/strategyAdaptationService');
const { getDatabase, closeDatabase } = require('../src/db');

async function run() {
  const current = contracts.buildStrategyContract({ problem: 'Implement a small API endpoint.' });
  const transition = adaptation.planAdaptation(current, {
    need: 'Investigate an intermittent production outage with unknown cause.',
    reason: 'The implementation is complete but production evidence shows an intermittent outage.'
  });
  assert.equal(transition.changed, true);
  assert.equal(transition.registryEvaluated, 77);
  assert.equal(transition.candidate.strategy_registry.selection_complete, true);
  assert.notEqual(transition.candidate.selected_strategy.primary, current.selected_strategy.primary);

  const unchanged = adaptation.planAdaptation(current, {
    need: 'Implement another small API endpoint.',
    reason: 'The scope remains a low-risk implementation.'
  });
  assert.equal(unchanged.changed, false);
  assert.deepEqual(
    adaptation.remainingBudget({ budget: { tokens: 100, costUsd: 5, latencyMs: 1000, events: 10 }, metrics: { tokens: 40, costUsd: 1.5, latencyMs: 250, events: 3 } }),
    { tokens: 60, costUsd: 3.5, latencyMs: 750, events: 7 }
  );
  assert.throws(() => adaptation.planAdaptation(current, { need: 'security' }), (error) => error.code === 'STRATEGY_REASON_REQUIRED');

  const dbPath = path.resolve(__dirname, 'strategy-adaptation-test.db');
  if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
  const db = await getDatabase(dbPath);
  try {
    await db.run("INSERT INTO agents (id, name, role, status, execution_mode, current_task) VALUES ('adaptive-root', 'Adaptive root', 'orchestrator', 'running', 'orchestrator', 'Implement an API')");
    const firstContract = await contracts.saveContract(db, { agentId: 'adaptive-root', problem: 'Implement an API' });
    const firstRun = await execution.createExecutionRun(db, {
      agentId: 'adaptive-root', contractRecord: firstContract,
      budget: { tokens: 100000, costUsd: 5, latencyMs: 600000, events: 100 }
    });
    const changed = await adaptation.changeStrategy(db, {
      orchestratorId: 'adaptive-root',
      need: 'Diagnose an intermittent production outage with unknown cause.',
      reason: 'Repeated runtime failures invalidate the implementation profile.'
    });
    assert.equal(changed.changed, true);
    assert.equal(changed.registryEvaluated, 77);
    assert.equal(changed.current.version, 2);
    assert.notEqual(changed.current.primary, changed.previous.primary);
    assert.equal((await execution.getRun(db, firstRun.id)).status, 'cancelled');
    assert.equal((await execution.getRun(db, changed.executionRun.runId)).status, 'planned');
  } finally {
    await closeDatabase();
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
  }
  console.log('Dynamic strategy adaptation checks passed.');
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
