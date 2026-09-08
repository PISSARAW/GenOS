const assert = require('node:assert/strict');
const modelRouter = require('../src/services/modelRouter');
const modelProvider = require('../src/services/modelProvider');

const originalGenerate = modelProvider.generate;
modelProvider.generate = async () => ({ text: 'database route', provider: 'openai', inputTokens: 1, outputTokens: 1 });

const db = {
  async all(sql) {
    assert.match(sql, /provider_configs/);
    return [{ provider: 'openai', model: 'db-model' }];
  },
  async get() { return null; }
};

modelRouter.generate({
  db,
  policy: { primary: null, fallbacks: [], parallelReview: [], mode: 'fallback', preferLocal: false },
  prompt: 'route from database'
}).then((result) => {
  assert.equal(result.model, 'openai://db-model');
  console.log('Database providers are available as default routes.');
}).finally(() => { modelProvider.generate = originalGenerate; });
