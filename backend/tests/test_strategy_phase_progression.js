const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');

process.env.GENOS_ADMIN_PASSWORD = process.env.GENOS_ADMIN_PASSWORD || 'phase-progression-test';

const { getDatabase, closeDatabase } = require('../src/db');
const strategyService = require('../src/services/strategyExecutionService');
const strategyContracts = require('../src/services/strategyContractService');

async function stepStatuses(db, runId) {
  return db.all('SELECT sequence, stage_key, status FROM strategy_execution_steps WHERE run_id = ? ORDER BY sequence', runId);
}

async function run() {
  const dbPath = path.resolve(__dirname, 'strategy-phase-progression.db');
  for (const suffix of ['', '-shm', '-wal']) {
    if (fs.existsSync(`${dbPath}${suffix}`)) fs.unlinkSync(`${dbPath}${suffix}`);
  }
  const db = await getDatabase(dbPath);
  try {
    await db.run("INSERT OR REPLACE INTO agents (id, name, role, status, execution_mode) VALUES ('phase-agent', 'Phase Agent', 'orchestrator', 'running', 'orchestrator')");
    const contractRecord = await strategyContracts.saveContract(db, {
      agentId: 'phase-agent',
      problem: 'Progress through every runtime phase'
    });
    const executionRun = await strategyService.createExecutionRun(db, {
      agentId: 'phase-agent',
      contractRecord,
      budget: { tokens: 8000, costUsd: 0.05, latencyMs: 120000, events: 12 }
    });
    assert.equal(executionRun.steps.length, 8);

    const started = await strategyService.recordExecutionEvent(db, 'phase-agent', {
      eventType: 'AGENT_RUNTIME_STARTED', action: 'START', detail: 'Runtime initiated', payload: {}
    });
    assert.equal(started.halt, false, started.reason);

    // Regression: entering `snapshot` must settle `memory_retrieval` instead of
    // halting with "Cannot enter 'snapshot' before completing: memory_retrieval".
    const planned = await strategyService.recordExecutionEvent(db, 'phase-agent', {
      eventType: 'AGENT_PLAN_CREATED', action: 'PLAN', detail: 'Plan created', payload: {}
    });
    assert.equal(planned.halt, false, planned.reason);
    assert.equal(planned.reason, null);
    const afterPlan = await stepStatuses(db, executionRun.id);
    assert.equal(afterPlan[0].status, 'completed');
    assert.equal(afterPlan[1].status, 'running');

    // A later phase may legitimately fail on its own primitives (the runtime
    // context is absent at this unit level), but it must never fail because an
    // earlier phase was left unfinished by the phase gate.
    const stepped = await strategyService.recordExecutionEvent(db, 'phase-agent', {
      eventType: 'AGENT_STEP', action: 'EXECUTE', detail: 'Implementation',
      payload: { usage: { input_tokens: 100, cached_input_tokens: 60, output_tokens: 50 } }
    });
    assert.doesNotMatch(String(stepped.reason || ''), /Cannot enter/);
    const afterStep = await stepStatuses(db, executionRun.id);
    assert.equal(afterStep[0].status, 'completed');
    assert.equal(afterStep.filter((step) => step.sequence < 3).some((step) => step.status === 'running'), false);
    console.log('Strategy phase progression settles predecessors without the memory_retrieval deadlock.');
  } finally {
    await closeDatabase();
    for (const suffix of ['', '-shm', '-wal']) {
      const file = `${dbPath}${suffix}`;
      if (fs.existsSync(file)) fs.unlinkSync(file);
    }
  }
}

run().catch((error) => { console.error(error); process.exit(1); });
