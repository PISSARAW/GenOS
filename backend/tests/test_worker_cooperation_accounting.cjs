'use strict';

const assert = require('node:assert/strict');
const store = require('../src/services/biologicalWorkerStore');
const { accounting } = require('./helpers/workerCooperationLiveAccounting.cjs');
const measured = { budgetAssessment: { missing: [] } };
let receipts = { run1: measured };
let runs = [{ id: 'run1', agent_id: 'worker1', status: 'completed', metrics_json: '{"tokens":120}' }];
let ledger = [{ provider_called: 1, token_usage_source: 'provider', input_tokens: 100, output_tokens: 20 }];
const db = { all: async query => query.includes('FROM strategy_execution_runs') ? runs : ledger };

async function main() {
  const original = store.receipt;
  store.receipt = async (_db, runId) => receipts[runId];
  try {
    const success = await accounting(db, { id: 'root', planningTokens: 0 });
    assert.equal(success.complete, true);
    assert.equal(success.modelTokens, 120);
    assert.equal(success.knownModelTokens, 120);
    runs.push({ id: 'run2', agent_id: 'replacement', status: 'blocked', metrics_json: '{"tokens":0}' });
    receipts.run2 = { budgetAssessment: { missing: ['worker_llm_tokens', 'worker_provider_billing'] } };
    const failed = await accounting(db, { id: 'root', planningTokens: 0 });
    assert.equal(failed.complete, false);
    assert.equal(failed.modelTokens, null);
    assert.equal(failed.knownModelTokens, 120);
    assert.deepEqual(failed.unmeasuredWorkerRuns, [{ runId: 'run2', workerId: 'replacement',
      missing: ['worker_llm_tokens', 'worker_provider_billing'] }]);
    delete receipts.run2;
    const absent = await accounting(db, { id: 'root' });
    assert.deepEqual(absent.unmeasuredWorkerRuns[0].missing, ['worker_receipt']);
    runs = runs.slice(0, 1);
    ledger = [{ provider_called: 1, token_usage_source: 'unavailable', input_tokens: null, output_tokens: null }];
    const unknown = await accounting(db, { id: 'root' });
    assert.equal(unknown.complete, false);
    assert.equal(unknown.modelTokens, null);
    assert.equal(unknown.knownModelTokens, 0);
    ledger = [{ provider_called: 0, token_usage_source: 'not_called', input_tokens: 0, output_tokens: 0 }];
    const notCalled = await accounting(db, { id: 'root' });
    assert.equal(notCalled.complete, true);
    assert.equal(notCalled.modelTokens, 0);
    console.log('Live accounting: measured subtotal, native gaps, missing receipt and unavailable provider usage PASS.');
  } finally { store.receipt = original; }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
