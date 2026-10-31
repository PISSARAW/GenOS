'use strict';
const assert = require('node:assert/strict');
const { openDatabase } = require('./helpers/biologyDatabase');
const { TABLES_MODEL_ATTEMPTS } = require('../src/db/schema-model-attempts');
const runner = require('../src/services/modelRouteRunner');
const router = require('../src/services/modelRouter');
const plans = require('../src/services/localModelDelegation');
const authority = require('../src/services/missionEnvelopeAuthority');
const kinds = require('../src/services/agents/workerKindService');

async function database() {
  const db = openDatabase();
  await db.exec(`${TABLES_MODEL_ATTEMPTS}
    CREATE TABLE provider_configs (provider TEXT, model TEXT, endpoint TEXT,
      capabilities_json TEXT, cost_input REAL, cost_output REAL, latency_ms INTEGER, enabled INTEGER);`);
  await db.run('INSERT INTO provider_configs VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    'ollama', 'qwen-budget-test', 'http://127.0.0.1:11435/api/chat', '[]', 0, 0, 0, 1);
  return db;
}

function route(db, input) {
  return { db, agentId: 'worker', executionRunId: input.runId, prompt: input.prompt,
    requestTokenBudget: input.tokens, maxTokens: 256, maxCostUsd: 0, stream: false,
    contextTokens: 16384, remainingMs: () => 5000, onToken() {} };
}

async function refusedBeforeProvider(db) {
  const reservations = (await db.get('SELECT COUNT(*) AS n FROM model_budget_reservations')).n;
  const request = route(db, { runId: 'refused', prompt: 'x'.repeat(2564 * 4), tokens: 2564 });
  await assert.rejects(runner.attemptRoute(request, 'ollama://qwen-budget-test'), { code: 'BUDGET_EXHAUSTED' });
  const receipt = await db.get('SELECT * FROM model_attempt_ledger WHERE mission_id=?', 'refused');
  assert.equal(receipt.provider_called, 0);
  assert.equal(receipt.token_usage_source, 'not_called');
  assert.equal(receipt.input_tokens, 0);
  assert.equal(receipt.output_tokens, 0);
  assert.equal((await db.get('SELECT COUNT(*) AS n FROM model_budget_reservations')).n, reservations);
}

async function forwarding() {
  const original = router.generate;
  router.generate = async options => { assert.equal(options.requestTokenBudget, 2564); return { text: 'ok' }; };
  try {
    await require('../src/services/workerEvidenceBarrierLocal').generateWorkerResult({
      mission: { agentId: 'worker', executionBudget: { tokens: 9000 } }, executionRun: { id: 'run' },
      requestTokenBudget: 2564, workerModel: 'ollama://qwen-budget-test', maxTokens: 10,
      promptText: 'Read fixture.', responseFormatOverride: 'json_object', stageTimings: {} });
  } finally { router.generate = original; }
}

async function routedPromptRefusal() {
  const discovery = require('../src/services/localModelDiscovery');
  const original = discovery.discoverLocalModels;
  discovery.discoverLocalModels = async () => [{ uri: 'ollama://qwen-budget-test', chatCapable: true }];
  try {
    await assert.rejects(router.generate({ model: 'ollama://qwen-budget-test',
      prompt: 'Short assignment.', cognitiveRawPrompt: 'x'.repeat(400),
      requestTokenBudget: 50, maxTokens: 10 }), { code: 'BUDGET_EXHAUSTED' });
  } finally { discovery.discoverLocalModels = original; }
}

async function oversizedPlan() {
  const original = authority.assertRun;
  authority.assertRun = async () => {};
  let calls = 0;
  const contract = kinds.grantBoundedDelegation(kinds.buildWorkerContract('sub_orchestrator', { workerTokenLimit: 10000 }));
  try {
    await assert.rejects(plans.generate({ db: {}, mission: { agentId: 'sub', workerContract: contract,
      executionBudget: { tokens: 100 } }, executionRun: { id: 'sub-run' },
      promptText: 'Coordinate.', maxTokens: 100 }, async () => { calls++; }), { code: 'BUDGET_EXHAUSTED' });
    assert.equal(calls, 0, 'Planning instructions are included before invoking the model.');
  } finally { authority.assertRun = original; }
}

async function delegationRemainder(exhaustPlan) {
  const dispatch = require('../src/services/agents/subOrchestratorDispatchService');
  const store = require('../src/services/biologicalWorkerStore');
  const original = { authority: authority.assertRun, dispatch: dispatch.dispatchLocalModelChild, receipt: store.receipt };
  authority.assertRun = async () => {};
  let calls = 0; let children = 0;
  dispatch.dispatchLocalModelChild = async () => { children++; return { childAgentId: 'child', status: 'completed',
    supervision: { evidenceReport: { outcome: 'success', content: 'x'.repeat(2000) } } }; };
  store.receipt = async () => ({ receiptId: 'receipt', result: { verified: false } });
  const contract = kinds.grantBoundedDelegation(kinds.buildWorkerContract('sub_orchestrator', { workerTokenLimit: 10000 }));
  try {
    await assert.rejects(plans.generate({ db: { async get() { return { id: 'child-run' }; } },
      mission: { agentId: 'sub', workerContract: contract, executionBudget: { tokens: 1000 } },
      executionRun: { id: 'sub-run' }, promptText: 'Coordinate.', maxTokens: 500 }, async () => {
      calls++;
      return { text: JSON.stringify({ children: [{ workerKind: 'bounded_worker', mission: 'Observe.',
        modelTokens: 1000, mode: 'analysis', dependsOn: -1 }] }), inputTokens: exhaustPlan ? 1000 : 900, outputTokens: 1, costUsd: 0 };
    }), { code: 'BUDGET_EXHAUSTED' });
    assert.equal(calls, 1, 'An exhausted plan or oversized synthesis cannot invoke a second provider call.');
    assert.equal(children, exhaustPlan ? 0 : 1);
  } finally { authority.assertRun = original.authority; dispatch.dispatchLocalModelChild = original.dispatch; store.receipt = original.receipt; }
}

async function main() {
  const db = await database();
  const original = global.fetch;
  let calls = 0;
  global.fetch = async (url, options) => {
    calls++;
    assert.equal(JSON.parse(options.body).options.num_predict, 28, 'Output fits estimated complete prompt plus remaining budget.');
    return new Response(JSON.stringify({ model: 'qwen-budget-test', message: { content: '{}' },
      prompt_eval_count: 12, eval_count: 8 }), { headers: { 'content-type': 'application/json' } });
  };
  try {
    await refusedBeforeProvider(db);
    assert.equal(calls, 0);
    const result = await runner.attemptRoute(route(db, { runId: 'accepted', prompt: 'x'.repeat(400), tokens: 128 }), 'ollama://qwen-budget-test');
    assert.equal(calls, 1);
    assert.equal(result.inputTokens + result.outputTokens, 20, 'Measured usage remains distinct from preflight estimates.');
    await refusedBeforeProvider(db);
    assert.equal(calls, 1, 'Refusal never increments the provider counter.');
    await forwarding();
    await routedPromptRefusal();
    assert.equal(calls, 1, 'The cognitive route prompt is checked before provider invocation.');
    await oversizedPlan();
    await delegationRemainder(true);
    await delegationRemainder(false);
  } finally { global.fetch = original; await db.close(); }
  console.log('Complete provider prompt, remaining worker budget and no-call receipts: PASS');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
