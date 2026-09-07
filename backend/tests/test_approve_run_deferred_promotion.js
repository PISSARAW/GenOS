const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { getDatabase, closeDatabase } = require('../src/db');
const strategyContracts = require('../src/services/strategyContractService');
const strategyService = require('../src/services/strategyExecutionService');
const telemetry = require('../src/services/telemetryObserver');

async function run() {
  const dbPath = path.resolve(__dirname, 'test-approve-run-promotion.db');
  if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
  const db = await getDatabase(dbPath);

  try {
    const emittedEvents = [];
    const onTelemetry = (evt) => {
      emittedEvents.push(evt);
    };
    telemetry.on('telemetry', onTelemetry);

    await db.run("INSERT OR REPLACE INTO agents (id, name, role, status, execution_mode) VALUES ('agent-promo-test', 'Promo Agent', 'orchestrator', 'running', 'orchestrator')");
    const contractRecord = await strategyContracts.saveContract(db, {
      agentId: 'agent-promo-test',
      problem: 'High risk mission requiring human approval'
    });

    const contract = contractRecord.contract;
    contract.promotion.require_human_approval = true;
    const hash = strategyContracts.hashContract(contract);
    await db.run('UPDATE strategy_contracts SET contract_json = ?, contract_hash = ? WHERE id = ?', JSON.stringify(contract), hash, contractRecord.id);

    const run = await strategyService.createExecutionRun(db, {
      agentId: 'agent-promo-test',
      contractRecord: { ...contractRecord, contract },
      budget: { tokens: 10000, costUsd: 1, latencyMs: 30000, events: 50 }
    });

    await db.run("UPDATE strategy_execution_runs SET status = 'awaiting_approval' WHERE id = ?", run.id);
    await db.run("UPDATE strategy_execution_steps SET status = 'awaiting_approval' WHERE run_id = ? AND sequence = 7", run.id);

    const approvedRun = await strategyService.approveRun(db, run.id, {
      approvedBy: 'security_auditor',
      summary: 'Promotion audited and approved for production readiness.'
    });

    assert.equal(approvedRun.status, 'completed', 'Run status should be completed after approval');
    assert.equal(approvedRun.steps.find((s) => s.stageKey === 'conditional_promotion')?.status, 'completed');

    const finalizedEvent = emittedEvents.find((e) => e.eventType === 'STRATEGY_PROMOTION_FINALIZED');
    assert(finalizedEvent, 'STRATEGY_PROMOTION_FINALIZED event should be emitted');
    assert.equal(finalizedEvent.payload.runId, run.id);
    assert.equal(finalizedEvent.payload.approvedBy, 'security_auditor');

    telemetry.off('telemetry', onTelemetry);
    console.log('✅ approveRun successfully executes deferred promotion pipeline and telemetry.');
  } finally {
    await closeDatabase();
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
    for (const suffix of ['-shm', '-wal']) {
      if (fs.existsSync(`${dbPath}${suffix}`)) fs.unlinkSync(`${dbPath}${suffix}`);
    }
  }
}

run().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
