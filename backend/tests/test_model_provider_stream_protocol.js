'use strict';
const assert = require('node:assert/strict');
const { readStreamingResponse } = require('../src/services/modelProviderRequest');

function responseFor(frames) {
  const encoder = new TextEncoder();
  let index = 0;
  return { body: { getReader: () => ({
    read: async () => index < frames.length ? { done: false, value: encoder.encode(frames[index++]) } : { done: true },
    releaseLock() {}, cancel: async () => {}
  }) } };
}

async function rejectsCode(frames, code) {
  await assert.rejects(readStreamingResponse(responseFor(frames), async () => {}), (error) => error.code === code);
}

(async () => {
  const complete = await readStreamingResponse(responseFor([
    'data: {"choices":[{"delta":{"content":"{\\"ok\\":true}"},"finish_reason":null}]}\n',
    'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n',
    'data: [DONE]\n'
  ]), async () => {});
  assert.equal(complete.text, '{"ok":true}');
  assert.equal(complete.finishReason, 'stop');
  await rejectsCode([
    'data: {"choices":[{"delta":{"content":"partial"},"finish_reason":"content_filter"}]}\n',
    'data: [DONE]\n'
  ], 'MODEL_PROVIDER_CONTENT_FILTERED');
  await rejectsCode([
    'data: {"choices":[{"delta":{"content":"partial"},"finish_reason":"length"}]}\n',
    'data: [DONE]\n'
  ], 'MODEL_PROVIDER_INCOMPLETE_STREAM');
  await rejectsCode(['data: {"choices":[{"delta":{"content":"partial"},"finish_reason":null}]}\n'],
    'MODEL_PROVIDER_INCOMPLETE_STREAM');
  await rejectsCode(['data: [DONE]\n', 'data: {"choices":[{"delta":{"content":"late"}}]}\n'],
    'MODEL_PROVIDER_INCOMPLETE_STREAM');
  console.log('Model provider SSE protocol checks passed.');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
