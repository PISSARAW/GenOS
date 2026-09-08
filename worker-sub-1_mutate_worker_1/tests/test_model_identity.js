const assert = require('node:assert/strict');
const router = require('../src/services/modelRouter');
const provider = require('../src/services/modelProvider');
const discovery = require('../src/services/localModelDiscovery');

const originalGenerate = provider.generate;
const originalDiscovery = discovery.discoverLocalModels;
const originalEndpoint = discovery.endpointForModel;

discovery.discoverLocalModels = async () => [];
discovery.endpointForModel = () => null;
provider.generate = async () => ({
  provider: 'ollama', model: 'provider-reported-model', servedModel: 'provider-reported-model',
  endpoint: 'http://127.0.0.1:11434/v1/chat/completions', text: 'ok', inputTokens: 1, outputTokens: 1
});

router.generate({ model: 'ollama://requested-model', prompt: 'test' })
  .then((result) => {
    assert.equal(result.requestedModel, 'ollama://requested-model');
    assert.equal(result.servedModel, 'provider-reported-model');
    assert.equal(result.endpoint, 'http://127.0.0.1:11434/v1/chat/completions');
    console.log('Model identity coherence checks passed.');
  })
  .catch((error) => { console.error(error); process.exitCode = 1; })
  .finally(() => {
    provider.generate = originalGenerate;
    discovery.discoverLocalModels = originalDiscovery;
    discovery.endpointForModel = originalEndpoint;
  });