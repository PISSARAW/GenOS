const assert = require('node:assert/strict');
const router = require('../src/services/modelRouter');
const provider = require('../src/services/modelProvider');
const discovery = require('../src/services/localModelDiscovery');

const originalGenerate = provider.generate;
const originalDiscovery = discovery.discoverLocalModels;
discovery.discoverLocalModels = async () => [];
provider.generate = async ({ model }) => ({ model, provider: 'openai', text: 'ok', inputTokens: 1, outputTokens: 1 });

router.generate({
  model: 'openai://primary', prompt: 'test', maxTokens: 100,
  maxCostUsd: 0.0015,
  policy: { mode: 'parallel', parallelReview: ['openai://review'] },
  db: { get: async () => ({ cost_input: 10, cost_output: 10 }) }
}).then(
  () => { throw new Error('parallel aggregate budget was not enforced'); },
  (error) => assert.equal(error.code, 'MODEL_PARALLEL_COST_BUDGET_EXCEEDED')
).then(() => console.log('Parallel model budget checks passed.'))
  .catch((error) => { console.error(error); process.exitCode = 1; })
  .finally(() => { provider.generate = originalGenerate; discovery.discoverLocalModels = originalDiscovery; });