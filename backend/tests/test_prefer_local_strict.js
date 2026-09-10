const assert = require('node:assert/strict');
const router = require('../src/services/modelRouter');
const discovery = require('../src/services/localModelDiscovery');
const provider = require('../src/services/modelProvider');

function strictPolicy(primary, fallbacks) {
  return { primary, fallbacks: fallbacks || [], parallelReview: [], mode: 'fallback', preferLocal: true };
}

async function expectLocalRequired(promise, label) {
  try {
    await promise;
  } catch (error) {
    assert.equal(error.code, 'LOCAL_MODEL_REQUIRED', label);
    return;
  }
  assert.fail(`${label}: expected LOCAL_MODEL_REQUIRED`);
}

(async () => {
  const restoreDiscovery = discovery.discoverLocalModels;
  const restoreGenerate = provider.generate;
  discovery.discoverLocalModels = async () => [];
  provider.generate = async (request) => ({ text: 'ok', inputTokens: 1, outputTokens: 1, model: request.model });

  // preferLocal + cloud-only candidates and no explicit opt-in: no silent cloud fallback.
  await expectLocalRequired(router.generate({ model: 'openai://cloud-only', prompt: 'hi', policy: strictPolicy('openai://cloud-only') }), 'cloud-only must fail');

  // Explicit allowCloudFallback restores the cloud route.
  const allowed = await router.generate({ model: 'openai://cloud-only', prompt: 'hi', allowCloudFallback: true, policy: strictPolicy('openai://cloud-only') });
  assert.equal(allowed.model, 'openai://cloud-only');

  // preferLocal + a local candidate available: local route is served first.
  discovery.discoverLocalModels = async () => [{ uri: 'ollama://local-one', chatCapable: true }];
  const local = await router.generate({ model: 'ollama://local-one', prompt: 'hi', policy: strictPolicy('ollama://local-one', ['openai://cloud-only']) });
  assert.equal(local.model, 'ollama://local-one');

  discovery.discoverLocalModels = restoreDiscovery;
  provider.generate = restoreGenerate;
  console.log('Prefer-local strict checks: PASS');
})().catch((error) => {
  console.error('Prefer-local strict test failed:', error);
  process.exit(1);
});
