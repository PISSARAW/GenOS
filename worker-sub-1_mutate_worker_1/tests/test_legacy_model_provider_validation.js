const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');

const result = spawnSync(process.execPath, ['-e', "require('./backend/src/services/modelProvider')"], {
  cwd: require('node:path').resolve(__dirname, '../..'),
  env: { ...process.env, GENOS_DEFAULT_MODEL: '', LLM_PROVIDER: 'invalid-provider', OLLAMA_MODEL: 'llama3' },
  encoding: 'utf8'
});

assert.notEqual(result.status, 0);
assert.match(`${result.stdout}\n${result.stderr}`, /Unsupported legacy model provider/);
console.log('Legacy provider configuration rejects unsupported providers.');