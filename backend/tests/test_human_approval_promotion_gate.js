const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { getDatabase, closeDatabase } = require('../src/db');
const strategyExecutionController = require('../src/controllers/strategyExecutionController');
const strategyContracts = require('../src/services/strategyContractService');
const strategyService = require('../src/services/strategyExecutionService');
const signatureService = require('../src/services/promotionSignatureService');

async function run() {
  const dbPath = path.resolve(__dirname, 'test-human-approval-gate.db');
  if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
  const db = await getDatabase(dbPath);

  try {
    await db.run("INSERT OR REPLACE INTO workspaces (id, name, path) VALUES ('workspace-promo-test-2', 'Promo', '/tmp/promo')");
    await db.run("INSERT OR REPLACE INTO agents (id, workspace_id, name, role, status, execution_mode) VALUES ('agent-promo-test-2', 'workspace-promo-test-2', 'Promo Agent', 'orchestrator', 'running', 'orchestrator')");
    const contractRecord = await strategyContracts.saveContract(db, {
      agentId: 'agent-promo-test-2',
      problem: 'High risk mission'
    });
    const contract = contractRecord.contract;
    contract.promotion.require_human_approval = true;
    const hash = strategyContracts.hashContract(contract);
    await db.run('UPDATE strategy_contracts SET contract_json = ?, contract_hash = ? WHERE id = ?', JSON.stringify(contract), hash, contractRecord.id);

    const run = await strategyService.createExecutionRun(db, {
      agentId: 'agent-promo-test-2',
      contractRecord: { ...contractRecord, contract },
      budget: { tokens: 10000, costUsd: 1, latencyMs: 30000, events: 50 }
    });
    
    await db.run("UPDATE strategy_execution_runs SET status = 'awaiting_approval' WHERE id = ?", run.id);

    // Mock Express res
    let responseStatus = 200;
    let responseBody = null;
    const res = {
      status: (code) => { responseStatus = code; return res; },
      json: (data) => { responseBody = data; return res; }
    };

    // 1. Missing signature
    const reqMissing = {
      params: { runId: run.id },
      body: {},
      user: { username: 'test-auditor' }
    };
    await strategyExecutionController.approve(reqMissing, res);
    assert.equal(responseStatus, 403, 'Should reject missing signature with 403');
    assert.match(responseBody.error.message, /Missing cryptographic signature/);

    // 2. Invalid signature
    responseStatus = 200;
    const reqInvalid = {
      params: { runId: run.id },
      body: { signature: 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890', timestamp: Date.now(), signerId: 'test-auditor' },
      user: { username: 'test-auditor' }
    };
    await strategyExecutionController.approve(reqInvalid, res);
    assert.equal(responseStatus, 403, 'Should reject invalid signature with 403');
    assert.match(responseBody.error.message, /Invalid cryptographic signature/);

    // 3. Valid signature
    responseStatus = 200;
    const payload = { runId: run.id, timestamp: Date.now(), signerId: 'test-auditor' };
    const validSignature = signatureService.generateSignature(payload);
    const reqValid = {
      params: { runId: run.id },
      body: { signature: validSignature, timestamp: payload.timestamp, signerId: payload.signerId },
      user: { username: 'test-auditor' }
    };
    await strategyExecutionController.approve(reqValid, res);
    if (responseStatus !== 200) {
      console.log('Error in valid signature:', responseBody);
    }
    assert.equal(responseStatus, 200, 'Should accept valid signature with 200');
    assert.equal(responseBody.id, run.id, 'Should return the run');
    assert.equal(responseBody.status, 'completed', 'Run should be completed');

    console.log('✅ Cryptographic signature validation for human approval gate works correctly.');
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