const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { getDatabase, closeDatabase } = require('../src/db');
const strategyContracts = require('../src/services/strategyContractService');
const strategyService = require('../src/services/strategyExecutionService');
const promotionPolicy = require('../src/services/strategyPromotionPolicyService');

async function run() {
  console.log('--- Testing Strategy Promotion Policies ---');

  // Test 1: evaluatePromotionGate unit checks
  const contractWithPolicies = {
    promotion: {
      require_replay: true,
      require_independent_verification: true,
      require_human_approval: true,
      preserve_rejected_branches: true,
      merge_workspace_automatically: false
    }
  };

  const evalFail = promotionPolicy.evaluatePromotionGate(contractWithPolicies, {
    replayVerified: false,
    independentVerification: false,
    humanApproved: false
  });
  assert.equal(evalFail.eligible, false);
  assert(evalFail.violations.some((v) => v.policy === 'require_replay'));
  assert(evalFail.violations.some((v) => v.policy === 'require_independent_verification'));
  assert(evalFail.violations.some((v) => v.policy === 'require_human_approval'));

  const evalPass = promotionPolicy.evaluatePromotionGate(contractWithPolicies, {
    replayVerified: true,
    independentVerification: true,
    humanApproved: true
  });
  assert.equal(evalPass.eligible, true);
  assert.equal(evalPass.violations.length, 0);
  console.log('✓ Point 3.1: evaluatePromotionGate correctly enforces replay and verification');

  // Test 2: applyPostPromotionPolicies
  const dbPath = path.resolve(__dirname, 'test-promotion-policies.db');
  if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
  const db = await getDatabase(dbPath);

  try {
    const postRes = await promotionPolicy.applyPostPromotionPolicies(db, contractWithPolicies, {
      agentId: 'agent-policy-test',
      rejectedBranchIds: ['branch_reject_1', 'branch_reject_2'],
      winnerWorkspaceRoot: '/tmp/winner',
      targetWorkspaceRoot: '/tmp/target'
    });
    assert.equal(postRes.success, true);
    assert.equal(postRes.actionsTaken.filter((a) => a.action === 'preserve_branch').length, 2);

    const preservedEvents = await db.all("SELECT * FROM telemetry_events WHERE event_type = 'BRANCH_PRESERVED'");
    assert.equal(preservedEvents.length, 2);
    console.log('✓ Point 3.2: applyPostPromotionPolicies preserves rejected branches');

    // Test 3: Integration with recordExecutionEvent
    await db.run("INSERT OR REPLACE INTO agents (id, name, role, status, execution_mode) VALUES ('agent-policy-test', 'Policy Agent', 'orchestrator', 'running', 'orchestrator')");
    const contractRecord = await strategyContracts.saveContract(db, {
      agentId: 'agent-policy-test',
      problem: 'High risk mission requiring replay and verification'
    });

    const contract = contractRecord.contract;
    contract.promotion.require_replay = true;
    contract.promotion.require_independent_verification = true;
    contract.promotion.require_human_approval = false;
    const hash = strategyContracts.hashContract(contract);
    await db.run('UPDATE strategy_contracts SET contract_json = ?, contract_hash = ? WHERE id = ?', JSON.stringify(contract), hash, contractRecord.id);

    const run = await strategyService.createExecutionRun(db, {
      agentId: 'agent-policy-test',
      contractRecord: { ...contractRecord, contract },
      budget: { tokens: 10000, costUsd: 1, latencyMs: 30000, events: 50 }
    });

    // Event completing without replay: should be blocked by promotion gate
    const failRes = await strategyService.recordExecutionEvent(db, 'agent-policy-test', {
      eventType: 'AGENT_COMPLETED',
      action: 'COMPLETE',
      detail: 'Done without replay',
      payload: { executionRunId: run.id, replayVerified: false, independentVerification: true }
    });
    assert.equal(failRes.halt, true);
    assert.match(failRes.reason, /Promotion gate blocked.*require_replay/);
    console.log('✓ Point 3.3: Missing replay verification blocks execution completion');

  } finally {
    await closeDatabase();
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
    for (const suffix of ['-shm', '-wal']) {
      if (fs.existsSync(`${dbPath}${suffix}`)) fs.unlinkSync(`${dbPath}${suffix}`);
    }
  }

  console.log('✅ All Strategy Promotion Policy tests passed.');
}

run().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
