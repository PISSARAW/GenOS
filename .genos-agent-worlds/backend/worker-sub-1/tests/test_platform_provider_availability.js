const assert = require('node:assert/strict');
const { configuredProviderRows } = require('../src/controllers/platformController');

const previousKey = process.env.OPENAI_API_KEY;
delete process.env.OPENAI_API_KEY;
delete process.env.GENOS_MODEL_API_KEY;
assert.deepEqual(configuredProviderRows([
  { provider: 'openai', model: 'gpt-4o-mini', endpoint: null },
  { provider: 'ollama', model: 'llama3', endpoint: 'http://127.0.0.1:11434/v1/chat/completions' }
]).map((row) => row.provider), ['ollama']);
if (previousKey === undefined) delete process.env.OPENAI_API_KEY;
else process.env.OPENAI_API_KEY = previousKey;
console.log('Platform routing excludes providers missing runtime configuration.');