const assert = require('node:assert/strict');
const discovery = require('../src/services/localModelDiscovery');

const previousFetch = global.fetch;
const previousEndpoint = process.env.GENOS_OLLAMA_ENDPOINT;
process.env.GENOS_OLLAMA_ENDPOINT = 'http://127.0.0.1:11434/v1/chat/completions';
global.fetch = async () => { throw new Error('provider unavailable'); };

(async () => {
  const models = await discovery.discoverLocalModels({ force: true });
  assert.deepEqual(models, []);
  assert(discovery.discoveryErrors().some((error) => /ollama/i.test(error)));
  console.log('Provider discovery errors remain observable.');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => {
  global.fetch = previousFetch;
  if (previousEndpoint === undefined) delete process.env.GENOS_OLLAMA_ENDPOINT;
  else process.env.GENOS_OLLAMA_ENDPOINT = previousEndpoint;
});
