const assert = require('node:assert/strict');
const router = require('../src/services/modelRouter');
const provider = require('../src/services/modelProvider');

const originalGenerate = provider.generate;
provider.generate = async () => ({ model: 'openai://tools-model', provider: 'openai', text: 'ok', inputTokens: 1, outputTokens: 1 });

(async () => {
  const db = {
    async get(sql) {
      if (sql.includes('provider_configs')) return { capabilities_json: JSON.stringify(['reasoning']), cost_input: 0, cost_output: 0 };
      return null;
    }
  };
  await assert.rejects(
    router.generate({ db, model: 'openai://tools-model', prompt: 'test', requiredCapabilities: ['tools'] }),
    (error) => error.code === 'MODEL_CAPABILITY_MISMATCH'
  );
  console.log('Model capability routing checks passed.');
})().catch((error) => { console.error(error); process.exitCode = 1; })
  .finally(() => { provider.generate = originalGenerate; });
