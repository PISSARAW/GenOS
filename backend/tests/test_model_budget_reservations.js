'use strict';

const assert = require('node:assert/strict');
const { openDatabase } = require('./helpers/biologyDatabase');
const { TABLES_MODEL_ATTEMPTS } = require('../src/db/schema-model-attempts');
const reservations = require('../src/services/modelBudgetReservationService');
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
  await db.run(`INSERT INTO provider_configs VALUES
    ('openai', 'backup', 'https://api.example.test/v1', '[]', 1, 1, 0, 1)`);
  return db;
}

function context(db, options = {}) {
  return { db, organizationId: 'org', projectId: 'project',
    executionRunId: 'mission', budgetReservationId: 'shared',
    prompt: 'x', maxTokens: 1, maxCostUsd: 0.000002,
    onToken() {}, remainingMs: () => 100, ...options };
}

async function rows(db) {
  return db.all('SELECT * FROM model_budget_reservations ORDER BY created_at, id');
}

async function testConcurrentAdmission() {
  const db = await database();
  let calls = 0;
  provider.generate = async () => {
    calls += 1;
    await new Promise((resolve) => setTimeout(resolve, 15));
    return { text: 'ok', inputTokens: 1, outputTokens: 1, tokenUsageMeasured: true };
  };
  try {
    const outcomes = await Promise.allSettled([
      runner.attemptRoute(context(db), 'openai://model'),
      runner.attemptRoute(context(db), 'openai://model')
    ]);
    assert.equal(outcomes.filter((row) => row.status === 'fulfilled').length, 1);
    assert.equal(calls, 1);
    assert.equal((await rows(db)).filter((row) => row.status === 'settled').length, 1);
  } finally { await db.close(); }
}

async function testReleaseAndUnknownCharge() {
  const db = await database();
  try {
    await assert.rejects(runner.attemptRoute(context(db, { remainingMs: () => 0 }),
      'openai://model'), /deadline/);
    assert.equal((await rows(db))[0].status, 'released');
    provider.generate = async () => { throw new Error('connection lost'); };
    await assert.rejects(runner.attemptRoute(context(db), 'openai://model'), /connection lost/);
    assert.equal((await rows(db)).find((row) => row.status === 'uncertain').reserved_cost_usd,
      0.000002);
    await assert.rejects(runner.attemptRoute(context(db), 'openai://model'),
      /remaining shared budget/);
  } finally { await db.close(); }
}

async function testSettlementIdempotentAndZero() {
  const db = await database();
  try {
    const zero = context(db, { maxCostUsd: 0 });
    provider.generate = async () => { throw new Error('provider must not be called'); };
    await assert.rejects(runner.attemptRoute(zero, 'openai://model'), /Estimated model cost/);
    assert.equal((await rows(db)).length, 0);
    await assert.rejects(runner.attemptRoute(context(db, { maxTokens: 0 }),
      'openai://model'), (error) => error.code === 'MODEL_TOKEN_BUDGET_EXCEEDED');
    assert.equal((await rows(db)).length, 0);
    const ctx = context(db, { budgetReservationId: 'idempotent' });
    const attempt = { id: 'attempt', actionId: 'action' };
    const first = await reservations.reserve({ db, ctx, attempt,
      costUsd: 0.000002, tokens: 2 });
    const repeated = await reservations.reserve({ db, ctx, attempt,
      costUsd: 0.000002, tokens: 2 });
    assert.equal(repeated.duplicate, true);
    await reservations.settle(db, first, { providerCalled: true,
      costUsd: 0.000001, tokens: 2 });
    await reservations.settle(db, first, { providerCalled: true,
      costUsd: 0.000002, tokens: 2 });
    const settled = (await rows(db))[0];
    assert.equal(settled.actual_cost_usd, 0.000001);
    assert.equal(settled.status, 'settled');
  } finally { await db.close(); }
}

async function testFallbackAndTokenCeiling() {
  const db = await database();
  let calls = 0;
  provider.generate = async (options) => {
    calls += 1;
    if (options.model === 'openai://model') {
      const error = new Error('first model failed');
      error.usage = { inputTokens: 1, outputTokens: 0, tokenUsageMeasured: true };
      throw error;
    }
    return { text: 'backup', inputTokens: 1, outputTokens: 1,
      tokenUsageMeasured: true };
  };
  try {
    const result = await runner.runFallback(['openai://model', 'openai://backup'],
      context(db, { maxCostUsd: 0.000003, providerContinuity: true }));
    assert.equal(result.route.selectedModel, 'openai://backup');
    assert.equal(calls, 2);
    assert.equal((await rows(db)).filter((row) => row.status === 'settled').length, 2);
    const capped = context(db, { budgetReservationId: 'child-scope',
      maxCostUsd: 0.00001, budgetMaxTokens: 2 });
    const first = await reservations.reserve({ db, ctx: capped,
      attempt: { id: 'child-1', actionId: 'parent' }, costUsd: 0.000002, tokens: 2 });
    assert.deepEqual(JSON.parse(first.scopeId), ['org', 'project', 'child-scope']);
    await assert.rejects(reservations.reserve({ db, ctx: capped,
      attempt: { id: 'child-2', actionId: 'child' }, costUsd: 0.000002,
      tokens: 1 }), /token reservation/);
  } finally { await db.close(); }
}

async function testUnknownRemotePriceBlocksCall() {
  let called = false;
  provider.generate = async () => { called = true; return { text: 'unexpected' }; };
  const db = { get: async () => null, run: async () => ({ changes: 0 }) };
  await assert.rejects(runner.attemptRoute(context(db), 'openai://unpriced'),
    (error) => error.code === 'MODEL_COST_QUOTE_UNAVAILABLE');
  assert.equal(called, false);
}

(async () => {
  await testConcurrentAdmission();
  await testReleaseAndUnknownCharge();
  await testSettlementIdempotentAndZero();
  await testFallbackAndTokenCeiling();
  await testUnknownRemotePriceBlocksCall();
  console.log('Model budget reservation checks passed.');
})().catch((error) => { console.error(error); process.exitCode = 1; })
  .finally(() => { provider.generate = originalGenerate; });
