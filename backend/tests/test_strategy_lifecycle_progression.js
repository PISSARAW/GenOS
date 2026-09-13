const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');

process.env.GENOS_ADMIN_PASSWORD = process.env.GENOS_ADMIN_PASSWORD || 'lifecycle-progression-test';

const { getDatabase, closeDatabase } = require('../src/db');
const strategyService = require('../src/services/strategyExecutionService');
const strategyContracts = require('../src/services/strategyContractService');
const { missingContext } = require('../src/services/strategyExecutionEvents');

// Unit: context-gated pipeline primitives report their missing inputs.
assert.deepEqual(missingContext('run', {}), ['tool']);
assert.deepEqual(missingContext('run', { tool: 'genos_inspect' }), []);
assert.deepEqual(missingContext('vfs_dry_run', { workspaceId: 'ws-1' }), ['patch']);
assert.deepEqual(missingContext('snapshot', {}), [], 'snapshot is context-free');

async function run() {
  const dbPath = path.resolve(__dirname, 'strategy-lifecycle-progression.db');
  for (const suffix of ['', '-shm', '-wal']) {
    if (fs.existsSync(`${dbPath}${suffix}`)) fs.unlinkSync(`${dbPath}${suffix}`);
  }
  const db = await getDatabase(dbPath);
  try {
    await db.run("INSERT OR REPLACE INTO agents (id, name, role, status, execution_mode) VALUES ('lifecycle-orch', 'Lifecycle Orch', 'orchestrator', 'running', 'orchestrator')");
    await db.run("INSERT OR REPLACE INTO agents (id, name, role, status, execution_mode, parent_agent_id) VALUES ('lifecycle-worker', 'Lifecycle Worker', 'worker', 'running', 'worker', 'lifecycle-orch')");
    const contractRecord = await strategyContracts.saveContract(db, { agentId: 'lifecycle-orch', problem: 'Résoudre une équation différentielle linéaire du second ordre' });
    const executionRun = await strategyService.createExecutionRun(db, {
      agentId: 'lifecycle-worker',
      contractRecord,
      budget: { tokens: 12000, costUsd: 0.05, latencyMs: 150000, events: 20 }
    });

    const timeline = [
      { eventType: 'AGENT_RUNTIME_STARTED', action: 'START', detail: 'Runtime initiated', payload: {} },
      { eventType: 'AGENT_PLAN_CREATED', action: 'PLAN', detail: 'Plan created', payload: {} },
      { eventType: 'AGENT_STEP', action: 'EXECUTE', detail: 'Implementation step', payload: {} },
      { eventType: 'VERIFY', action: 'VERIFY', detail: 'Verification step', payload: {} },
      {
        eventType: 'AGENT_COMPLETED', action: 'COMPLETE', detail: 'Done',
        payload: {
          replayVerified: true,
          independentVerification: true,
          evidenceReport: { outcome: 'success', claims: [{ statement: 'Solved the ODE', evidence: ['derivation'] }], uncertainties: [], replayVerified: true }
        }
      }
    ];

    for (const event of timeline) {
      const result = await strategyService.recordExecutionEvent(db, 'lifecycle-worker', event);
      assert.equal(result.halt, false, `${event.eventType} halted: ${result.reason}`);
    }

    const steps = await db.all('SELECT sequence, stage_key, status FROM strategy_execution_steps WHERE run_id = ? ORDER BY sequence', executionRun.id);
    const byStage = Object.fromEntries(steps.map((step) => [step.stage_key, step.status]));
    // Regression: instrumented_run used to halt with "orchestratorId and tool
    // required for execution" because the lifecycle event carries no tool. It is
    // not applicable and must be skipped instead.
    assert.equal(byStage.instrumented_run, 'skipped');
    assert.equal(steps.some((step) => step.status === 'blocked'), false);

    const run = await strategyService.getRun(db, executionRun.id);
    assert.ok(['completed', 'awaiting_approval'].includes(run.status), `unexpected run status ${run.status}`);
    console.log('Lifecycle phases without runtime inputs are skipped, not fatal; the mission completes.');
  } finally {
    await closeDatabase();
    for (const suffix of ['', '-shm', '-wal']) {
      const file = `${dbPath}${suffix}`;
      if (fs.existsSync(file)) fs.unlinkSync(file);
    }
  }
}

run().catch((error) => { console.error(error); process.exit(1); });
