const assert = require('node:assert/strict');
const router = require('../src/services/modelRouter');
const runner = require('../src/services/modelRouteRunner');
const provider = require('../src/services/modelProvider');
const discovery = require('../src/services/localModelDiscovery');

const originalGenerate = provider.generate;
const originalDiscovery = discovery.discoverLocalModels;
let aborted = false;
discovery.discoverLocalModels = async () => [];
provider.generate = async ({ signal }) => await new Promise((resolve, reject) => {
  signal.addEventListener('abort', () => { aborted = true; reject(Object.assign(new Error('aborted'), { name: 'AbortError' })); }, { once: true });
});

(async () => {
  const context = { prompt: 'test', maxTokens: 1, onToken() {},
    remainingMs: () => 0 };
  await assert.rejects(runner.attemptRoute(context, 'openai://hung'),
    (error) => error.code === 'MODEL_ROUTE_DEADLINE_EXCEEDED');
  assert.equal(aborted, false);
  await assert.rejects(runner.attemptRoute({ ...context, remainingMs: () => 50 },
    'openai://hung'), (error) => error.code === 'MODEL_ROUTE_DEADLINE_EXCEEDED');
  assert.equal(aborted, true);
  await assert.rejects(router.generate({ model: 'openai://hung', prompt: 'test',
    timeoutMs: 20 }), (error) => error.code === 'MODEL_ROUTE_DEADLINE_EXCEEDED');
})()
  .then(() => console.log('Model route abort checks passed.'))
  .catch((error) => { console.error(error); process.exitCode = 1; })
  .finally(() => { provider.generate = originalGenerate; discovery.discoverLocalModels = originalDiscovery; });
