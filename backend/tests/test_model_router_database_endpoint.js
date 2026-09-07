const assert = require('node:assert/strict');
const router = require('../src/services/modelRouter');
const provider = require('../src/services/modelProvider');

const originalGenerate = provider.generate;
const originalConfiguration = provider.modelConfiguration;
let receivedEndpoint;

provider.modelConfiguration = (model, endpoint) => ({
  uri: model,
  provider: 'openai-compatible',
  modelName: 'local-model',
  endpoint: endpoint || 'http://127.0.0.1:9000/v1/chat/completions',
  configured: true,
  keySource: null
});
provider.generate = async (options) => {
  receivedEndpoint = options.endpoint;
  return { text: 'ok', inputTokens: 1, outputTokens: 1, provider: 'openai-compatible' };
};

const db = {
  async get(sql, providerName, modelName) {
    assert.match(sql, /provider_configs/);
    assert.equal(providerName, 'openai-compatible');
    assert.equal(modelName, 'local-model');
    return { endpoint: 'http://127.0.0.1:9000/v1/chat/completions', cost_input: 0, cost_output: 0, latency_ms: 1 };
  }
};

router.generate({ db, model: 'openai-compatible://local-model', prompt: 'test' })
  .then(() => assert.equal(receivedEndpoint, 'http://127.0.0.1:9000/v1/chat/completions'))
  .then(() => console.log('Database provider endpoints reach model generation.'))
  .catch((error) => { console.error(error); process.exitCode = 1; })
  .finally(() => {
    provider.generate = originalGenerate;
    provider.modelConfiguration = originalConfiguration;
  });