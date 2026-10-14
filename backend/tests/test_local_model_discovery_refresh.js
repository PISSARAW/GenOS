const assert = require('node:assert/strict');
const modelRouter = require('../src/services/modelRouter');
const discovery = require('../src/services/localModelDiscovery');

const originalDiscovery = discovery.discoverLocalModels;
const originalFetch = global.fetch;
const previousOllamaEndpoint = process.env.GENOS_OLLAMA_ENDPOINT;
const calls = [];

async function verifyNativeOllamaDiscovery() {
  process.env.GENOS_OLLAMA_ENDPOINT = 'http://127.0.0.1:11434/api/chat';
  const urls = [];
  global.fetch = async (url) => {
    urls.push(String(url));
    return String(url) === 'http://127.0.0.1:11434/api/tags'
      ? { ok: true, json: async () => ({ models: [{ name: 'qwen2.5-coder:7b' }] }) }
      : { ok: false, status: 503 };
  };
  const models = await originalDiscovery({ force: true });
  assert(models.some((model) => model.uri === 'ollama://qwen2.5-coder:7b'));
  assert(urls.includes('http://127.0.0.1:11434/api/tags'));
}

async function verifyRefreshAfterFailure() {
  discovery.discoverLocalModels = async (options = {}) => { calls.push(options); return []; };
  global.fetch = async () => ({ ok: false, status: 503 });
  await assert.rejects(modelRouter.generate({ model: 'ollama://offline-model', prompt: 'test' }));
  assert(calls.some((options) => options.force === true));
}

Promise.resolve().then(verifyNativeOllamaDiscovery).then(verifyRefreshAfterFailure).finally(() => {
  discovery.discoverLocalModels = originalDiscovery;
  global.fetch = originalFetch;
  if (previousOllamaEndpoint === undefined) delete process.env.GENOS_OLLAMA_ENDPOINT;
  else process.env.GENOS_OLLAMA_ENDPOINT = previousOllamaEndpoint;
  console.log('Local discovery normalizes native Ollama endpoints and refreshes after provider failure.');
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
