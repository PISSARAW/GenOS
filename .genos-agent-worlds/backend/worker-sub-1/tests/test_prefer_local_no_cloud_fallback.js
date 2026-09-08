const assert = require('node:assert/strict');
const router = require('../src/services/modelRouter');
const discovery = require('../src/services/localModelDiscovery');

const originalDiscovery = discovery.discoverLocalModels;
discovery.discoverLocalModels = async () => [];
router.generate({
  model: 'auto',
  prompt: 'local only',
  policy: { primary: 'auto', fallbacks: [], parallelReview: [], mode: 'fallback', preferLocal: true }
}).then(
  () => assert.fail('preferLocal must not silently fall back to a cloud model.'),
  (error) => assert.equal(error.code, 'LOCAL_MODEL_REQUIRED')
).finally(() => {
  discovery.discoverLocalModels = originalDiscovery;
  console.log('Prefer-local routing rejects implicit cloud fallback.');
});
