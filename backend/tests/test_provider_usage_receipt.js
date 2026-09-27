const assert = require('node:assert/strict');
const { buildFinalResponse, buildStreamResponse, readStreamingResponse } = require('../src/services/modelProviderRequest');

const base = { text: 'Bonjour', toolCalls: [], prompt: 'Question', provider: 'openai', modelName: 'test', responseFormat: null };

const measured = buildFinalResponse({ ...base, payload: {
  id: 'response-1', usage: { prompt_tokens: 12, completion_tokens: 4 }
} });
assert.deepEqual(measured.usageReceipt, {
  apiVersion: 'genos.communication-usage/v1', source: 'model-provider',
  responseId: 'response-1', inputTokens: 12, outputTokens: 4
});

const estimated = buildFinalResponse({ ...base, payload: { id: 'response-2' } });
assert.equal(estimated.usageReceipt, undefined);
assert(estimated.inputTokens > 0);

const partial = buildFinalResponse({ ...base, payload: {
  id: 'response-3', usage: { prompt_tokens: 12 }
} });
assert.equal(partial.usageReceipt, undefined);

const gemini = buildFinalResponse({ ...base, payload: {
  responseId: 'gemini-1', usageMetadata: { promptTokenCount: 7, candidatesTokenCount: 3 }
} });
assert.equal(gemini.usageReceipt.responseId, 'gemini-1');
assert.equal(gemini.usageReceipt.outputTokens, 3);

const encoded = new TextEncoder().encode('data: {"id":"stream-1","choices":[{"delta":{"content":"Salut"}}]}\n\ndata: {"id":"stream-1","usage":{"prompt_tokens":5,"completion_tokens":2},"choices":[]}\n\n');
const response = { body: new ReadableStream({ start(controller) { controller.enqueue(encoded); controller.close(); } }) };
readStreamingResponse(response, async () => {}).then((streamed) => {
  const result = buildStreamResponse(streamed, { options: { prompt: 'Bonjour' }, provider: 'openai', modelName: 'test' });
  assert.equal(result.text, 'Salut');
  assert.equal(result.usageReceipt.responseId, 'stream-1');
  assert.equal(result.usageReceipt.inputTokens, 5);
  console.log('Provider usage receipts distinguish measured counts from estimates.');
}).catch((error) => { console.error(error); process.exitCode = 1; });
