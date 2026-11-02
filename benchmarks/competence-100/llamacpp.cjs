'use strict';

const fs = require('node:fs');
const crypto = require('node:crypto');
const path = require('node:path');
const protocol = require('./protocol.json');

async function fileDigest(filename) {
  const digest = crypto.createHash('sha256');
  for await (const chunk of fs.createReadStream(filename)) digest.update(chunk);
  return digest.digest('hex');
}

function localEndpoint(value) {
  const url = new URL(value);
  if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || url.username || url.password) {
    throw Error('The standalone inference endpoint must be HTTP on 127.0.0.1');
  }
  return url.origin;
}

async function describe(modelName, filename) {
  const config = JSON.parse(fs.readFileSync(filename, 'utf8'));
  const endpoint = localEndpoint(config.endpoint);
  if (modelName !== config.modelName) throw Error('Runtime model identity mismatch');
  const [digest, binaryDigest] = await Promise.all([fileDigest(config.modelFile), fileDigest(config.executable)]);
  if (digest !== config.modelSha256 || binaryDigest !== config.binarySha256) throw Error('Runtime file digest mismatch');
  const response = await fetch(endpoint + '/props', { signal: AbortSignal.timeout(3000) });
  if (!response.ok) throw Error('Standalone runtime properties unavailable');
  const props = await response.json();
  if (path.resolve(props.model_path) !== path.resolve(config.modelFile) || props.model_alias !== modelName) {
    throw Error('Loaded model does not match the fingerprinted weights');
  }
  if (props.default_generation_settings.n_ctx !== protocol.maximumInputTokens) throw Error('Context budget mismatch');
  return { name: modelName, digest, endpoint, provider: 'llama.cpp-local', runtime: {
    config, binaryDigest, modelFileDigest: digest, contextTokens: props.default_generation_settings.n_ctx,
    quantization: props.model_ftype, chatTemplateDigest: crypto.createHash('sha256').update(props.chat_template).digest('hex')
  } };
}

async function complete(input) {
  const response = await fetch(input.model.endpoint + '/v1/chat/completions', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    signal: AbortSignal.timeout(input.timeoutMs),
    body: JSON.stringify({ model: input.model.name, messages: input.messages, stream: false,
      response_format: { type: 'json_object' }, temperature: 0, seed: input.seed,
      max_tokens: input.maxTokens, cache_prompt: false })
  });
  if (!response.ok) throw Error('Standalone inference HTTP ' + response.status + ' ' + (await response.text()).slice(0, 1000));
  const body = await response.json();
  return { raw: body.choices?.[0]?.message?.content, model: body.model,
    inputTokens: body.usage?.prompt_tokens, outputTokens: body.usage?.completion_tokens,
    doneReason: body.choices?.[0]?.finish_reason, runtimeTimings: body.timings || null };
}

module.exports = { describe, complete, localEndpoint, fileDigest };
