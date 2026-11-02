'use strict';

const protocol = require('./protocol.json');
const agent = require('./agent.cjs');
const { hash } = require('./corpus.cjs');
const URL = 'http://127.0.0.1:11434';
const standalone = require('./llamacpp.cjs');

async function describe(model) {
  if (model.includes(':cloud')) throw Error('Only installed local models are permitted');
  if (process.env.GENOS_COMPETENCE_LLAMA_CONFIG) return standalone.describe(model, process.env.GENOS_COMPETENCE_LLAMA_CONFIG);
  const response = await fetch(URL + '/api/tags', { signal: AbortSignal.timeout(3000) });
  if (!response.ok) throw Error('Ollama discovery failed');
  const found = (await response.json()).models.find(row => row.name === model);
  if (!found?.digest) throw Error('Local model is not installed');
  return { name: found.name, digest: found.digest, endpoint: URL };
}

async function requireReady(model) {
  if (model.provider === 'llama.cpp-local') return standaloneReady(model);
  const response = await fetch(URL + '/api/chat', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    signal: AbortSignal.timeout(protocol.maximumRequestMs),
    body: JSON.stringify({ model: model.name, stream: false, format: 'json',
      options: { temperature: 0, num_predict: 32, num_ctx: protocol.maximumInputTokens },
      messages: [{ role: 'user', content: 'Return only JSON {"ready":true}.' }] })
  });
  if (!response.ok) throw Error('INFERENCE_UNAVAILABLE: HTTP ' + response.status + ' ' + (await response.text()).slice(0, 1600));
  const body = await response.json();
  if (!body.message?.content || body.model !== model.name) throw Error('INFERENCE_PREFLIGHT_INVALID');
  return { status: 'ready', model: body.model, inputTokens: body.prompt_eval_count,
    outputTokens: body.eval_count, note: 'Technical warm-up only; no experimental problem or feedback.' };
}

async function standaloneReady(model) {
  const result = await standalone.complete({ model, timeoutMs: protocol.maximumRequestMs,
    maxTokens: 32, seed: 1, messages: [{ role: 'user', content: 'Return only JSON {"ready":true}.' }] });
  if (!result.raw || result.model !== model.name) throw Error('INFERENCE_PREFLIGHT_INVALID');
  return { status: 'ready', ...result, note: 'Technical warm-up only; no experimental problem or feedback.' };
}

async function request(input, state) {
  const remaining = protocol.maximumDurationMs - (Date.now() - state.started);
  if (remaining <= 0 || state.calls >= protocol.maximumCalls) throw Error('Campaign budget exhausted');
  state.calls++;
  if (state.model.provider === 'llama.cpp-local') return standalone.complete({ model: state.model,
    timeoutMs: Math.min(remaining, protocol.maximumRequestMs), maxTokens: protocol.maximumOutputTokens,
    seed: parseInt(hash(input.task.id).slice(0, 7), 16),
    messages: [{ role: 'system', content: agent.INSTRUCTION },
      { role: 'user', content: agent.prompt(input.task, input.examples) }] });
  const response = await fetch(URL + '/api/chat', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    signal: AbortSignal.timeout(Math.min(remaining, protocol.maximumRequestMs)),
    body: JSON.stringify({ model: state.model.name, stream: false, format: 'json', keep_alive: '5m',
      options: { temperature: 0, seed: parseInt(hash(input.task.id).slice(0, 7), 16),
        num_predict: protocol.maximumOutputTokens, num_ctx: protocol.maximumInputTokens },
      messages: [{ role: 'system', content: agent.INSTRUCTION },
        { role: 'user', content: agent.prompt(input.task, input.examples) }] })
  });
  if (!response.ok) throw Error('Ollama HTTP ' + response.status);
  const body = await response.json();
  return { raw: body.message?.content, model: body.model, inputTokens: body.prompt_eval_count,
    outputTokens: body.eval_count, doneReason: body.done_reason };
}

async function attempt(input, state) {
  const start = performance.now();
  try {
    const result = await request(input, state);
    let value = null;
    try { value = JSON.parse(result.raw); } catch (_) { /* Retain invalid model output. */ }
    const valid = agent.validResponse(value);
    return { ...result, value, valid, error: valid ? null : 'INVALID_RESPONSE',
      elapsedMs: Math.round(performance.now() - start) };
  } catch (error) {
    return { value: null, valid: false, error: error.message, elapsedMs: Math.round(performance.now() - start) };
  }
}

function withinBudget(result, model) {
  return result.model === model.name && Number.isInteger(result.inputTokens)
    && result.inputTokens > 0 && result.inputTokens <= protocol.maximumInputTokens
    && Number.isInteger(result.outputTokens) && result.outputTokens <= protocol.maximumOutputTokens;
}

module.exports = { describe, requireReady, attempt, withinBudget };
