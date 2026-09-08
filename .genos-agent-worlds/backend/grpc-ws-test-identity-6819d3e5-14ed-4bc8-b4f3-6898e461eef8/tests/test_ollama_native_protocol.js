const assert = require('node:assert/strict');
const modelProvider = require('../src/services/modelProvider');

const originalFetch = global.fetch;
const chunks = [Buffer.from('{"message":{"content":"hello "},"done":false}\n'), Buffer.from('{"message":{"content":"ollama"},"done":true,"prompt_eval_count":3,"eval_count":2}\n')];
let request;
global.fetch = async (url, options) => {
  request = { url, body: JSON.parse(options.body) };
  let index = 0;
  return { ok: true, headers: { get: () => 'application/x-ndjson' }, body: { getReader: () => ({ read: async () => index < chunks.length ? { value: chunks[index++], done: false } : { done: true } }) } };
};
(async () => {
  const tokens = [];
  const result = await modelProvider.generate({ model: 'ollama://qwen', endpoint: 'http://127.0.0.1:11434/api/chat', prompt: 'hi', stream: true, onToken: (token) => tokens.push(token) });
  assert.equal(request.url, 'http://127.0.0.1:11434/api/chat');
  assert.equal(request.body.options, undefined);
  assert.equal(result.text, 'hello ollama');
  assert.deepEqual(tokens, ['hello ', 'ollama']);
  assert.equal(result.inputTokens, 3);
  assert.equal(result.outputTokens, 2);
  console.log('Ollama native protocol checks passed.');
})().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => { global.fetch = originalFetch; });
