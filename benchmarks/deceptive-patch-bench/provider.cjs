'use strict';
const protocol = require('./protocol.json');
async function post(config, route, body) {
  const headers = { 'content-type': 'application/json' };
  if (config.keyEnv) {
    const key = process.env[config.keyEnv];
    if (!key) throw Error('PROVIDER_KEY_MISSING');
    headers.authorization = `Bearer ${key}`;
  }
  const response = await fetch(config.endpoint + route, { method: 'POST', headers,
    signal: AbortSignal.timeout(protocol.requestTimeoutMs), body: JSON.stringify(body) });
  if (!response.ok) throw Error(`PROVIDER_HTTP_${response.status}`);
  return response.json();
}
async function identity(config) {
  if (config.kind === 'chat-completions') {
    if (!config.version) throw Error('EXPLICIT_MODEL_VERSION_REQUIRED');
    return { model: config.model, version: config.version, attestation: 'operator-supplied' };
  }
  if (config.kind !== 'ollama') throw Error('UNKNOWN_PROVIDER');
  const response = await fetch(config.endpoint + '/api/tags', { signal: AbortSignal.timeout(5000) });
  if (!response.ok) throw Error('OLLAMA_IDENTITY_UNAVAILABLE');
  const models = (await response.json()).models;
  const model = models.find(item => item.name === config.model || item.model === config.model);
  if (!model?.digest) throw Error('MODEL_DIGEST_UNAVAILABLE');
  return { model: config.model, version: model.digest, attestation: 'ollama-digest' };
}
async function call(config, messages, seed) {
  const body = config.kind === 'ollama'
    ? { model: config.model, messages, stream: false, format: 'json', options: {
      seed, temperature: protocol.temperature, num_predict: protocol.maxOutputTokens, num_ctx: 32768 } }
    : { model: config.model, messages, stream: false, seed, temperature: protocol.temperature,
      max_tokens: protocol.maxOutputTokens, response_format: { type: 'json_object' } };
  const raw = await post(config, config.kind === 'ollama' ? '/api/chat' : '/chat/completions', body);
  if (raw.model !== config.model) throw Error('MODEL_IDENTITY_CHANGED');
  const usage = nativeUsage(config, raw);
  const content = config.kind === 'ollama' ? raw.message?.content : raw.choices?.[0]?.message?.content;
  let action = null;
  try { action = JSON.parse(content); } catch { /* Invalid JSON consumes its call and tokens. */ }
  return { request: body, raw, action, usage };
}
function nativeUsage(config, raw) {
  const input = config.kind === 'ollama' ? raw.prompt_eval_count : raw.usage?.prompt_tokens;
  const output = config.kind === 'ollama' ? raw.eval_count : raw.usage?.completion_tokens;
  if (!Number.isSafeInteger(input) || !Number.isSafeInteger(output) || input < 0 || output < 0) throw Error('NATIVE_USAGE_MISSING');
  return { input, output, total: input + output };
}
module.exports = { call, identity, nativeUsage };
