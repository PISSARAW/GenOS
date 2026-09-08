const assert = require('node:assert/strict');
const router = require('../src/services/modelRouter');
const provider = require('../src/services/modelProvider');
const discovery = require('../src/services/localModelDiscovery');

const originalGenerate = provider.generate;
const originalDiscovery = discovery.discoverLocalModels;
let aborted = false;
discovery.discoverLocalModels = async () => [];
provider.generate = async ({ signal }) => await new Promise((resolve, reject) => {
  signal.addEventListener('abort', () => { aborted = true; reject(Object.assign(new Error('aborted'), { name: 'AbortError' })); }, { once: true });
});

router.generate({ model: 'openai://hung', prompt: 'test', timeoutMs: 20 })
  .then(() => { throw new Error('route unexpectedly completed'); }, (error) => {
    assert.equal(error.code, 'MODEL_ROUTE_DEADLINE_EXCEEDED');
    assert.equal(aborted, true);
  })
  .then(() => console.log('Model route abort checks passed.'))
  .catch((error) => { console.error(error); process.exitCode = 1; })
  .finally(() => { provider.generate = originalGenerate; discovery.discoverLocalModels = originalDiscovery; });