'use strict';

const assert = require('node:assert/strict');
const { qualify } = require('./run_worker_cooperation.cjs');

async function main() {
  const report = await qualify();
  assert.deepEqual(report.cases.map(item => item.stages.map(stage => stage.kind)), [
    ['resident_daemon'],
    ['resident_daemon', 'specialist', 'verifier_worker'],
    ['resident_daemon', 'specialist', 'verifier_worker', 'recovery_worker']
  ]);
  assert.ok(report.cases.every(item => item.finalError === 0 && !item.promoted));
  for (const scenario of report.cases.slice(1)) {
    const [monitor, specialist, verifier, recovery] = scenario.stages;
    assert.ok(specialist.inputRefs.includes(monitor.runId));
    assert.ok(verifier.inputRefs.includes(specialist.runId));
    if (recovery) assert.ok(recovery.inputRefs.includes(verifier.runId));
    assert.equal(scenario.responsePlan[2].condition, 'checkpoint_corrupted');
  }
  assert.equal(new Set(report.cases.flatMap(item => item.stages.map(stage => stage.runId))).size, 8);
  assert.equal(report.resources.modelTokens, 0);
  assert.equal(report.resources.oracleProcesses, 16);
  const budgets = require('./helpers/workerCooperationBudgets.cjs');
  assert.throws(() => budgets.controller(0));
  assert.throws(() => budgets.controller(5));
  assert.equal(report.limits.elapsedMs, [1, 3, 4].reduce((sum, count) => sum + budgets.controller(count).latencyMs, 0));
  for (const scenario of report.cases) {
    assert.equal(scenario.controller.budgetMs, budgets.controller(scenario.stages.length).latencyMs);
    assert.ok(Date.parse(scenario.controller.checkedAt) < Date.parse(scenario.controller.expiresAt));
  }
  for (const stage of report.cases.flatMap(item => item.stages)) {
    assert.equal(stage.timing.budgetMs, budgets.worker.latencyMs);
    assert.ok(Date.parse(stage.timing.completedAt) < Date.parse(stage.timing.expiresAt));
  }
  assert.ok(report.cases[2].sourceFinalError > 0, 'Recovery must not silently promote its capsule to the source.');
  console.log(`Worker cooperation: three real runtime scenarios PASS; ${JSON.stringify(report.resources)}`);
}

main().catch(error => { console.error(error); process.exitCode = 1; });
