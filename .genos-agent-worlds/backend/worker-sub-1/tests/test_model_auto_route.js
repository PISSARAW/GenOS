const assert = require('node:assert/strict');
const router = require('../src/services/modelRouter');
const discovery = require('../src/services/localModelDiscovery');

const originalDiscovery = discovery.discoverLocalModels;
const previousDefault = process.env.GENOS_DEFAULT_MODEL;
process.env.GENOS_DEFAULT_MODEL = 'auto';
discovery.discoverLocalModels = async () => [];

router.generate({ model: 'auto', prompt: 'test' })
  .then(() => { throw new Error('auto route unexpectedly succeeded without a model'); }, (error) => {
    assert.equal(error.code, 'LOCAL_MODEL_REQUIRED');
  })
  .then(() => console.log('Auto model route checks passed.'))
  .catch((error) => { console.error(error); process.exitCode = 1; })
  .finally(() => {
    discovery.discoverLocalModels = originalDiscovery;
    if (previousDefault === undefined) delete process.env.GENOS_DEFAULT_MODEL;
    else process.env.GENOS_DEFAULT_MODEL = previousDefault;
  });