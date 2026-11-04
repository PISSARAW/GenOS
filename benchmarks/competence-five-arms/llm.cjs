'use strict';

const protocol = require('./protocol.json');
const { hash } = require('./corpus.cjs');
const { valid } = require('./methods.cjs');
const endpoint = 'http://127.0.0.1:11434';
const INSTRUCTION = [
  'Predict an integer expression using only verified observations. Operator names are opaque.',
  'Each operator belongs to this PUBLIC hypothesis class: a*x+b; a*x*x+b*x+c; or a*x+b+c*max(0,x-5).',
  'Every coefficient is an integer in [-3,3]. Apply nested operators from the inside out.',
  'Epochs are public contexts: only observations with the query epoch for that operator apply; default epoch is 0.',
  'Several functions may fit observations yet disagree at the query input. In that case abstain with reason ambiguous.',
  'If a queried operator has no observation in its current epoch, abstain with reason missing and name it.',
  'For answerable queries compute the exact integer. An affine tool result, if supplied, is a hypothesis checked on observations, not proof beyond its class.',
  'Return ONLY JSON: {"answer":integer or null,"confidence":number 0..1,"abstain":boolean,',
  '"reason":"answerable" or "ambiguous" or "missing","missing":[operator names]}.',
  'Confidence is the probability that your numeric answer is exact; use 0 when abstaining. Never invent unobserved facts.'
].join(' ');

async function describe() {
  const response = await fetch(endpoint + '/api/tags', { signal: AbortSignal.timeout(5000) });
  if (!response.ok) throw Error('Model discovery HTTP ' + response.status);
  const found = (await response.json()).models.find(row => row.name === protocol.model);
  if (!found?.digest) throw Error('Required installed local model unavailable');
  return { name: found.name, digest: found.digest, endpoint };
}

async function ready() {
  const response = await fetch(endpoint + '/api/chat', { method: 'POST',
    headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(45000),
    body: JSON.stringify({ model: protocol.model, stream: false, format: 'json',
      messages: [{ role: 'user', content: 'Return only JSON {"ready":true}.' }],
      options: { temperature: 0, num_predict: 32, num_ctx: protocol.maximumInputTokens } }) });
  if (!response.ok) throw Error('Local inference readiness HTTP ' + response.status);
  const body = await response.json();
  if (body.model !== protocol.model || !body.message?.content) throw Error('Invalid model readiness');
  return { model: body.model, inputTokens: body.prompt_eval_count, outputTokens: body.eval_count };
}

async function request(payload, session) {
  if (session.calls >= protocol.maximumCalls) throw Error('Study model-call budget exhausted');
  const remaining = protocol.maximumDurationMs - (Date.now() - session.started);
  if (remaining <= 0) throw Error('Study duration budget exhausted');
  session.calls++;
  const seed = parseInt(hash(payload.query.id).slice(0, 7), 16);
  const response = await fetch(endpoint + '/api/chat', { method: 'POST',
    headers: { 'content-type': 'application/json' },
    signal: AbortSignal.timeout(Math.min(remaining, protocol.maximumRequestMs)),
    body: JSON.stringify({ model: protocol.model, stream: false, format: 'json', keep_alive: '10m',
      options: { temperature: protocol.temperature, seed, num_predict: protocol.maximumOutputTokens,
        num_ctx: protocol.maximumInputTokens },
      messages: [{ role: 'system', content: INSTRUCTION }, { role: 'user', content: JSON.stringify(payload) }] }) });
  if (!response.ok) throw Error('LLM HTTP ' + response.status);
  return response.json();
}

async function attempt(payload, session) {
  const started = Date.now();
  try {
    const body = await request(payload, session);
    let value = null;
    try { value = JSON.parse(body.message?.content); } catch (_) { /* Preserve the invalid output. */ }
    return { value, valid: valid(value), raw: body.message?.content, model: body.model,
      inputTokens: body.prompt_eval_count, outputTokens: body.eval_count,
      doneReason: body.done_reason, elapsedMs: Date.now() - started };
  } catch (error) {
    return { value: null, valid: false, error: error.message, elapsedMs: Date.now() - started };
  }
}

function withinBudget(result) {
  return result.model === protocol.model && Number.isInteger(result.inputTokens)
    && result.inputTokens > 0 && result.inputTokens <= protocol.maximumInputTokens
    && Number.isInteger(result.outputTokens) && result.outputTokens <= protocol.maximumOutputTokens;
}

module.exports = { INSTRUCTION, describe, ready, attempt, withinBudget };
