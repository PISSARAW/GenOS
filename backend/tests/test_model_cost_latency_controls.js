const assert = require('node:assert/strict');
const router = require('../src/services/modelRouter');
const provider = require('../src/services/modelProvider');
const discovery = require('../src/services/localModelDiscovery');

const originalGenerate = provider.generate;
const originalDiscovery = discovery.discoverLocalModels;
const originalEndpoint = discovery.endpointForModel;

(async () => {
  const ledger = [];
  const db = {
    async get(sql) {
      if (sql.includes('provider_configs')) return { endpoint: 'https://api.example.test/v1/chat/completions', cost_input: 2, cost_output: 4, latency_ms: 50 };
      return null;
    },
    async run(sql, ...args) { if (sql.includes('usage_ledger')) ledger.push(args); }
  };
  provider.generate = async () => ({ text: 'ok', inputTokens: 10, outputTokens: 5, provider: 'openai' });
  discovery.discoverLocalModels = async () => [];
  discovery.endpointForModel = () => null;

  const result = await router.generate({ db, organizationId: 'org-1', projectId: 'project-1', model: 'openai://model', prompt: 'hello' });
  assert.equal(result.costUsd, 0.00004);
  assert.equal(result.inputTokens + result.outputTokens, 15);
  assert.equal(ledger.length, 1);
  assert.equal(ledger[0][4], 'model_inference');

  await assert.rejects(
    router.generate({ db, model: 'openai://model', prompt: 'hello', maxCostUsd: 0.000001 }),
    /cost.*budget/
  );

  await assert.rejects(
    router.generate({ db, model: 'openai://model', prompt: 'hello', policy: { mode: 'parallel', parallelReview: ['openai://backup'] } }),
    /explicit non-negative maxCostUsd/
  );

  provider.generate = async () => new Promise(() => {});
  const started = Date.now();
  await assert.rejects(router.generate({ model: 'openai://model', prompt: 'hello', timeoutMs: 20 }), /deadline/);
  assert(Date.now() - started < 200, 'global route deadline must bound a hung provider');

  console.log('Model cost, budget, parallel guard, and deadline checks passed.');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => {
  provider.generate = originalGenerate;
  discovery.discoverLocalModels = originalDiscovery;
  discovery.endpointForModel = originalEndpoint;
});
