'use strict';

const assert = require('node:assert/strict');
const { openDatabase } = require('./helpers/biologyDatabase');
const { TABLES_MODEL_ATTEMPTS } = require('../src/db/schema-model-attempts');
const runner = require('../src/services/modelRouteRunner');
const schemaFailure = require('../src/services/workerEvidenceBarrierLocalSchemaFailure');
const failure = require('../src/services/workerEvidenceBarrierLocalFailure');
const { metricDelta } = require('../src/services/strategyExecutionEvents');
const { noProgressError } = require('../src/services/workerCodeTestRepairProgress');

async function database() {
  const db = openDatabase();
  await db.exec(`${TABLES_MODEL_ATTEMPTS}
    CREATE TABLE provider_configs (provider TEXT, model TEXT, endpoint TEXT,
      capabilities_json TEXT, cost_input REAL, cost_output REAL,
      latency_ms INTEGER, enabled INTEGER);`);
  await db.run('INSERT INTO provider_configs VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    'ollama', 'qwen-test', 'http://127.0.0.1:11435/api/chat', '[]', 0, 0, 0, 1);
  return db;
}

function route(db, maxTokens) {
  return { db, agentId: 'worker', executionRunId: 'run', prompt: 'Produce the required object.',
    maxTokens, maxCostUsd: 0, stream: false, remainingMs: () => 5000, onToken() {},
    responseFormat: { type: 'json_schema', schema: { type: 'object',
      required: ['expected'], additionalProperties: false,
      properties: { expected: { type: 'boolean' } } } } };
}

function terminal(error) {
  return failure.failurePayload({ mission: { localModel: 'ollama://wrong-request' },
    executionRun: { id: 'run' }, error, stageTimings: {} });
}

async function rejectedResponse(db) {
  const result = await runner.attemptRoute(route(db, 100), 'ollama://qwen-test');
  assert.equal(result.providerCalled, true);
  assert.equal(result.tokenUsageMeasured, true);
  assert.ok(result.schemaViolation, 'The real provider validator rejects the JSON object.');
  const error = schemaFailure.fromModelResult(result);
  assert.equal(error.code, 'WORKER_OUTPUT_SCHEMA_VIOLATION');
  const payload = terminal(error);
  assert.equal(payload.model, 'ollama://qwen-test');
  assert.equal(payload.provider, 'ollama');
  assert.deepEqual(payload.usage, { input_tokens: 12, output_tokens: 8, tokens: 20, cost_usd: 0 });
  assert.equal(metricDelta(payload).tokens, 20);
  assert.equal(metricDelta(payload).inputTokens, 12);
  assert.equal(payload.evidenceReport, undefined);
  assert.equal(failure.failureState(error).eventType, 'AGENT_FAILED');
  const ledger = await db.get('SELECT * FROM model_attempt_ledger WHERE mission_id = ?', 'run');
  assert.equal(ledger.provider_called, 1);
  assert.equal(ledger.token_usage_source, 'provider');
  assert.equal(ledger.input_tokens + ledger.output_tokens, payload.usage.tokens);
  const wrapped = noProgressError(error, { identicalFailures: 2 });
  assert.deepEqual(terminal(wrapped), payload, 'A repair stop preserves the failed call receipt.');
}

async function noProviderCall(db) {
  let rejection;
  try { await runner.attemptRoute({ ...route(db, 0), executionRunId: 'not-called' }, 'ollama://qwen-test'); }
  catch (error) { rejection = error; }
  assert.equal(rejection.code, 'MODEL_TOKEN_BUDGET_EXCEEDED');
  assert.equal(terminal(rejection).usage, undefined);
  const ledger = await db.get('SELECT * FROM model_attempt_ledger WHERE mission_id = ?', 'not-called');
  assert.equal(ledger.provider_called, 0);
  assert.equal(ledger.token_usage_source, 'not_called');
}

function unmeasuredResponse() {
  for (const details of [{ tokenUsageMeasured: false }, { providerCalled: false }, { inputTokens: -1 }]) {
    const error = schemaFailure.fromModelResult({ schemaViolation: { error: 'invalid' },
      providerCalled: true, tokenUsageMeasured: true, inputTokens: 12, outputTokens: 8, ...details });
    assert.equal(terminal(error).usage, undefined, 'Estimates never become measured terminal usage.');
  }
}

async function main() {
  const db = await database();
  const originalFetch = global.fetch;
  let calls = 0;
  global.fetch = async (url) => {
    assert.equal(url, 'http://127.0.0.1:11435/api/chat');
    calls += 1;
    return new Response(JSON.stringify({ model: 'qwen-test', message: { content: '{"wrong":true}' },
      prompt_eval_count: 12, eval_count: 8 }), { headers: { 'content-type': 'application/json' } });
  };
  try {
    await rejectedResponse(db);
    assert.equal(calls, 1);
    await noProviderCall(db);
    assert.equal(calls, 1, 'The denied request never invokes the provider.');
    unmeasuredResponse();
  } finally { global.fetch = originalFetch; await db.close(); }
  console.log('PASS worker rejected-schema usage, provider attribution and no-call accounting');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
