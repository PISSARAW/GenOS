const assert = require('node:assert/strict');
const runner = require('../src/services/modelRouteRunner');
const ledger = require('../src/services/modelAttemptLedger');
const provider = require('../src/services/modelProvider');

const originalGenerate = provider.generate;

function testDatabase() {
  const attempts = new Map();
  const usage = new Map();
  return { attempts, usage,
    async get() { return { endpoint: 'https://api.example.test/v1',
      cost_input: 2, cost_output: 4 }; },
    async run(sql, ...args) {
      if (sql.includes('INSERT OR IGNORE INTO model_attempt_ledger')) {
        if (!attempts.has(args[0])) attempts.set(args[0], { id: args[0],
          missionId: args[1], actionId: args[2], status: args[7] });
      } else if (sql.includes('UPDATE model_attempt_ledger')) {
        const row = attempts.get(args[9]);
        if (row && row.status === 'started') Object.assign(row, { status: args[0],
          providerCalled: args[1], inputTokens: args[2], outputTokens: args[3],
          source: args[4], costUsd: args[5], estimatedCostUsd: args[6],
          errorCode: args[7] });
      } else if (sql.includes('usage_ledger')) {
        if (!usage.has(args[0])) usage.set(args[0], args);
      }
    } };
}

function context(db, options = {}) {
  return { db, organizationId: 'org', projectId: 'project',
    executionRunId: 'mission', agentId: 'agent', prompt: 'x', maxTokens: 1,
    onToken() {}, remainingMs: () => 30, ...options };
}

async function testSuccess() {
  const db = testDatabase();
  provider.generate = async () => ({ text: 'ok', inputTokens: 10,
    outputTokens: 5, tokenUsageMeasured: true });
  const result = await runner.attemptRoute(context(db), 'openai://model');
  const attempt = db.attempts.get(result.routeAttemptId);
  assert.equal(attempt.status, 'completed');
  assert.equal(attempt.source, 'provider');
  assert.equal(attempt.missionId, 'mission');
  assert.equal(attempt.inputTokens + attempt.outputTokens, 15);
  assert.equal(db.usage.size, 1);
}

async function testUnknownFailure() {
  const db = testDatabase();
  provider.generate = async () => { throw new Error('provider unavailable'); };
  await assert.rejects(runner.attemptRoute(context(db), 'openai://model'), /unavailable/);
  const attempt = [...db.attempts.values()][0];
  assert.equal(attempt.status, 'failed');
  assert.equal(attempt.providerCalled, 1);
  assert.equal(attempt.inputTokens, null);
  assert.equal(attempt.source, 'unknown');
  assert.equal(attempt.costUsd, null);
  assert.equal(db.usage.size, 0);
}

async function testBudgetRejection() {
  const db = testDatabase();
  provider.generate = async () => ({ text: 'ok', inputTokens: 10,
    outputTokens: 5, tokenUsageMeasured: true });
  await assert.rejects(runner.attemptRoute(context(db, { maxCostUsd: 0.00001 }),
    'openai://model'), /Actual model cost/);
  const attempt = [...db.attempts.values()][0];
  assert.equal(attempt.status, 'rejected_budget');
  assert.equal(attempt.costUsd, 0.00004);
  assert.equal(db.usage.size, 1);
}

async function testPreflightAndFailedReceipt() {
  const db = testDatabase();
  let called = false;
  provider.generate = async () => { called = true; return { text: 'unexpected' }; };
  await assert.rejects(runner.attemptRoute(context(db, { maxCostUsd: 0 }),
    'openai://model'), /Estimated model cost/);
  const skipped = [...db.attempts.values()][0];
  assert.equal(called, false);
  assert.equal(skipped.status, 'skipped_budget');
  assert.equal(skipped.source, 'not_called');
  assert.equal(skipped.inputTokens, 0);
  assert.equal(skipped.costUsd, 0);
  provider.generate = async () => {
    const error = new Error('provider refused');
    error.usage = { inputTokens: 3, outputTokens: 2,
      tokenUsageMeasured: true };
    throw error;
  };
  await assert.rejects(runner.attemptRoute(context(db), 'openai://model'), /refused/);
  const failed = [...db.attempts.values()][1];
  assert.equal(failed.status, 'failed');
  assert.equal(failed.source, 'provider');
  assert.equal(db.usage.size, 1);
}

async function testTimeoutAndIdempotency() {
  const db = testDatabase();
  provider.generate = async () => new Promise(() => {});
  await assert.rejects(runner.attemptRoute(context(db, { remainingMs: () => 5 }),
    'openai://model'), /deadline/);
  const attempt = [...db.attempts.values()][0];
  assert.equal(attempt.status, 'timeout');
  assert.equal(attempt.source, 'unknown');
  await ledger.finishAttempt(db, { id: attempt.id, status: 'completed',
    tokenUsageSource: 'provider', inputTokens: 2, outputTokens: 2 });
  assert.equal(attempt.status, 'timeout');
}

(async () => {
  await testSuccess();
  await testUnknownFailure();
  await testBudgetRejection();
  await testPreflightAndFailedReceipt();
  await testTimeoutAndIdempotency();
  console.log('Model attempt accounting checks passed.');
})().catch((error) => { console.error(error); process.exitCode = 1; })
  .finally(() => { provider.generate = originalGenerate; });
