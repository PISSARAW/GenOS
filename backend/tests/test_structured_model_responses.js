const assert = require('node:assert/strict');
const modelProvider = require('../src/services/modelProvider');

const previousKey = process.env.OPENAI_API_KEY;
const previousEndpoint = process.env.OPENAI_API_ENDPOINT;
process.env.OPENAI_API_KEY = 'test-key';
process.env.OPENAI_API_ENDPOINT = 'http://127.0.0.1:9999/v1/chat/completions';
const originalFetch = global.fetch;
let requestBody;
global.fetch = async (_url, options) => {
  requestBody = JSON.parse(options.body);
  return {
    ok: true,
    headers: { get: () => 'application/json' },
    json: async () => ({ choices: [{ message: { content: '{"ok":true}' } }], usage: {} })
  };
};

(async () => {
  const result = await modelProvider.generate({
    model: 'openai://structured-test',
    prompt: 'Return JSON.',
    stream: false,
    responseFormat: 'json_object'
  });
  assert.deepEqual(requestBody.response_format, { type: 'json_object' });
  assert.deepEqual(result.structured, { ok: true });
  global.fetch = async () => ({
    ok: true,
    headers: { get: () => 'application/json' },
    json: async () => ({ choices: [{ message: { content: 'not json' } }] })
  });
  await assert.rejects(
    modelProvider.generate({ model: 'openai://structured-test', prompt: 'Return JSON.', stream: false, responseFormat: 'json_object' }),
    /invalid structured JSON/
  );
  console.log('Structured model response checks passed.');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => {
  global.fetch = originalFetch;
  if (previousKey === undefined) delete process.env.OPENAI_API_KEY;
  else process.env.OPENAI_API_KEY = previousKey;
  if (previousEndpoint === undefined) delete process.env.OPENAI_API_ENDPOINT;
  else process.env.OPENAI_API_ENDPOINT = previousEndpoint;
});
