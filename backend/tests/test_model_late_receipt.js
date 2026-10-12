'use strict';

const assert = require('node:assert/strict');
const { openDatabase } = require('./helpers/biologyDatabase');
const { TABLES_MODEL_ATTEMPTS } = require('../src/db/schema-model-attempts');
const runner = require('../src/services/modelRouteRunner');
const provider = require('../src/services/modelProvider');

const originalGenerate = provider.generate;

async function database() {
  const db = openDatabase();
  await db.exec(TABLES_MODEL_ATTEMPTS);
  await db.exec(`CREATE TABLE provider_configs
    (provider TEXT, model TEXT, endpoint TEXT, capabilities_json TEXT,
     cost_input REAL, cost_output REAL, latency_ms INTEGER, enabled INTEGER);
    CREATE TABLE usage_ledger
    (id TEXT PRIMARY KEY, organization_id TEXT, project_id TEXT, release_id TEXT,
     category TEXT, quantity REAL, cost_usd REAL, metadata_json TEXT);`);
  await db.run(`INSERT INTO provider_configs VALUES
    ('openai', 'model', 'https://api.example.test/v1', '[]', 1, 1, 0, 1)`);
  return db;
}

function context(db, scope) {
  return { db, organizationId: 'org', projectId: 'project',
    executionRunId: 'mission', budgetReservationId: scope,
    prompt: 'x', maxTokens: 1, maxCostUsd: 0.000003,
    onToken() {}, remainingMs: () => 5 };
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

async function waitFor(db, status) {
  for (let index = 0; index < 100; index += 1) {
    const row = await db.get('SELECT * FROM model_budget_reservations WHERE status = ?', status);
    if (row) return row;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error(`Late reservation never reached ${status}.`);
}

async function testMeasuredLateSuccess() {
  const db = await database();
  const pending = deferred();
  provider.generate = () => pending.promise;
  try {
    const ctx = context(db, 'measured');
    await assert.rejects(runner.attemptRoute(ctx,
      'openai://model'), /deadline/);
    const uncertain = await waitFor(db, 'uncertain');
    pending.resolve({ text: 'too late', inputTokens: 1, outputTokens: 0,
      tokenUsageMeasured: true });
    const settled = await waitFor(db, 'settled');
    await new Promise((resolve) => setTimeout(resolve, 10));
    assert.equal(settled.id, uncertain.id);
    assert.equal(settled.actual_tokens, 1);
    const attempt = await db.get('SELECT * FROM model_attempt_ledger WHERE id = ?', settled.id);
    assert.equal(attempt.status, 'timeout');
    assert.equal(attempt.token_usage_source, 'provider');
    assert.equal(attempt.cost_usd, 0.000001);
    assert.equal(ctx.spent, 0.000001);
    const usage = await db.get('SELECT * FROM usage_ledger');
    assert.equal(usage.quantity, 1);
    assert.equal(JSON.parse(usage.metadata_json).attemptStatus, 'late_receipt');
  } finally { await db.close(); }
}

async function testUnmeasuredLateResultRemainsReserved() {
  const db = await database();
  const pending = deferred();
  provider.generate = () => pending.promise;
  try {
    await assert.rejects(runner.attemptRoute(context(db, 'unmeasured'),
      'openai://model'), /deadline/);
    const uncertain = await waitFor(db, 'uncertain');
    pending.resolve({ text: 'late estimate', inputTokens: 1, outputTokens: 0 });
    await new Promise((resolve) => setTimeout(resolve, 20));
    const row = await db.get('SELECT * FROM model_budget_reservations WHERE id = ?', uncertain.id);
    assert.equal(row.status, 'uncertain');
    assert.equal(await db.get('SELECT * FROM usage_ledger'), undefined);
  } finally { await db.close(); }
}

async function testMeasuredLateFailure() {
  const db = await database();
  const pending = deferred();
  provider.generate = () => pending.promise;
  try {
    await assert.rejects(runner.attemptRoute(context(db, 'failure'),
      'openai://model'), /deadline/);
    await waitFor(db, 'uncertain');
    const failure = new Error('late provider failure');
    failure.usage = { inputTokens: 1, outputTokens: 0, tokenUsageMeasured: true };
    pending.reject(failure);
    const settled = await waitFor(db, 'settled');
    await new Promise((resolve) => setTimeout(resolve, 10));
    assert.equal(settled.actual_tokens, 1);
    const attempt = await db.get('SELECT * FROM model_attempt_ledger WHERE id = ?', settled.id);
    assert.equal(attempt.status, 'timeout');
    assert.equal(attempt.token_usage_source, 'provider');
  } finally { await db.close(); }
}

(async () => {
  await testMeasuredLateSuccess();
  await testUnmeasuredLateResultRemainsReserved();
  await testMeasuredLateFailure();
  console.log('Model late receipt reconciliation checks passed.');
})().catch((error) => { console.error(error); process.exitCode = 1; })
  .finally(() => { provider.generate = originalGenerate; });
