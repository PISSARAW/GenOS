const assert = require('node:assert/strict');
const modelRouter = require('../src/services/modelRouter');
const discovery = require('../src/services/localModelDiscovery');

const originalDiscovery = discovery.discoverLocalModels;
const originalFetch = global.fetch;
const calls = [];
discovery.discoverLocalModels = async (options = {}) => { calls.push(options); return []; };
global.fetch = async () => ({ ok: false, status: 503 });

modelRouter.generate({ model: 'ollama://offline-model', prompt: 'test' }).then(
  () => assert.fail('The unavailable provider must fail.'),
  () => assert(calls.some((options) => options.force === true))
).finally(() => {
  discovery.discoverLocalModels = originalDiscovery;
  global.fetch = originalFetch;
  console.log('Local discovery cache refreshes after provider failure.');
});