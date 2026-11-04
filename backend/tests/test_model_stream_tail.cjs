'use strict';
const assert = require('node:assert/strict');
const {readOllamaStream, readStreamingResponse} = require('../src/services/modelProviderRequest');

function response(text) {
  const bytes = new TextEncoder().encode(text);
  return new Response(new ReadableStream({start(controller) {
    for (const byte of bytes) controller.enqueue(Uint8Array.of(byte));
    controller.close();
  }}));
}

async function main() {
  const frames = [
    {model: 'fixture', message: {content: 'réussi'}, done: false},
    {model: 'fixture', message: {content: ''}, done: true, done_reason: 'stop', prompt_eval_count: 7, eval_count: 3}
  ].map(JSON.stringify).join('\n');
  for (const ending of ['', '\n']) {
    let observed = '';
    const result = await readOllamaStream(response(frames + ending), delta => {observed += delta;});
    assert.equal(result.text, 'réussi'); assert.equal(observed, 'réussi');
    assert.deepEqual(result.usage, {prompt_tokens: 7, completion_tokens: 3});
    assert.equal(result.finishReason, 'stop');
  }
  const sse = 'data: ' + JSON.stringify({model: 'fixture', choices: [{delta: {content: 'réussi'}, finish_reason: null}]})
    + '\n\ndata: ' + JSON.stringify({choices: [{delta: {}, finish_reason: 'stop'}], usage: {prompt_tokens: 7, completion_tokens: 3}})
    + '\n\ndata: [DONE]';
  assert.equal((await readStreamingResponse(response(sse), () => {})).text, 'réussi');
  await assert.rejects(() => readOllamaStream(response('{broken'), () => {}), /malformed NDJSON/);
  console.log('Native stream tails: missing newline, fragmented UTF-8, SSE DONE and malformed tail rejection PASS');
}
main().catch(error => {console.error(error); process.exitCode = 1;});
