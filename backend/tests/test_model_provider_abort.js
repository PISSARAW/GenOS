const assert = require('node:assert/strict');
const modelProvider = require('../src/services/modelProvider');

const originalFetch = global.fetch;
let fetchStarted;
const started = new Promise((resolve) => { fetchStarted = resolve; });
global.fetch = (_, options) => new Promise((_, reject) => {
  fetchStarted();
  if (options.signal.aborted) reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
  else options.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })), { once: true });
});

(async () => {
  const controller = new AbortController();
  const pending = modelProvider.generate({ model: 'ollama://abort-test', signal: controller.signal, timeoutMs: 10_000 });
  await started;
  controller.abort();
  await assert.rejects(pending, /Model timeout/);
  global.fetch = originalFetch;
  console.log('Model provider abort signal is propagated to fetch.');
})().catch((error) => {
  global.fetch = originalFetch;
  console.error(error);
  process.exitCode = 1;
});