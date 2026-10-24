'use strict';

const URL = 'http://127.0.0.1:11434';
const MAX_TOKENS = 96;

async function describe(model) {
  if (model.includes(':cloud')) throw Error('This protocol permits local models only');
  const response = await fetch(URL + '/api/tags', { signal: AbortSignal.timeout(3000) });
  if (!response.ok) throw Error('Local model discovery failed');
  const row = (await response.json()).models.find(item => item.name === model);
  if (!row?.digest) throw Error('Requested installed model is unavailable');
  return { model, digest: row.digest, provider: 'ollama-local', endpoint: URL };
}

async function request(input) {
  const response = await fetch(URL + '/api/chat', {
    method: 'POST', headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(input.timeoutMs),
    body: JSON.stringify({ model: input.model, stream: false, format: 'json', keep_alive: '5m',
      options: { temperature: 0, seed: input.seed, num_predict: MAX_TOKENS, num_ctx: 2048 },
      messages: [{ role: 'system', content: input.instruction }, { role: 'user', content: input.prompt }] })
  });
  if (!response.ok) throw Error('Local inference HTTP ' + response.status);
  const body = await response.json();
  return { value: JSON.parse(body.message.content), tokens: body.eval_count || 0,
    inputTokens: body.prompt_eval_count || 0, model: body.model };
}

module.exports = { describe, request, MAX_TOKENS };
