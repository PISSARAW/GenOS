'use strict';

const protocol = require('./protocol.json');
const legacy = require('../competence-five-arms/llm.cjs');
const { hash } = require('../competence-five-arms/corpus.cjs');
const contracts = require('./contracts.cjs');
const presentation = require('./presentation.cjs');

async function request(payload, session) {
  if (session.calls >= (session.maximumCalls || protocol.maximumCalls)) throw Error('Model-call budget exhausted');
  const remaining = protocol.maximumDurationMs - (Date.now() - session.started);
  if (remaining <= 0) throw Error('Duration budget exhausted');
  session.calls++;
  const prompt = presentation.prompt(payload);
  const schema = contracts.schema(payload.query);
  const response = await fetch('http://127.0.0.1:11434/api/chat', { method: 'POST',
    headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(Math.min(remaining, protocol.maximumRequestMs)),
    body: JSON.stringify({ model: protocol.model, stream: false, format: schema, keep_alive: '10m',
      options: { temperature: 0, seed: parseInt(hash(payload.query.id).slice(0, 7), 16),
        num_predict: protocol.maximumOutputTokens, num_ctx: protocol.maximumInputTokens },
      messages: [{ role: 'system', content: presentation.INSTRUCTION },
        { role: 'user', content: prompt + '\nOUTPUT SCHEMA: ' + JSON.stringify(schema) }] }) });
  if (!response.ok) throw Error('LLM HTTP ' + response.status);
  return { body: await response.json(), prompt, schema };
}

async function attempt(payload, session) {
  const started = Date.now();
  try {
    const { body, prompt, schema } = await request(payload, session);
    let value = null;
    try { value = JSON.parse(body.message?.content); } catch (_) { /* Preserve invalid native output. */ }
    return { value, valid: contracts.valid(value), raw: body.message?.content, prompt, schema, model: body.model,
      inputTokens: body.prompt_eval_count, outputTokens: body.eval_count,
      doneReason: body.done_reason, elapsedMs: Date.now() - started };
  } catch (error) { return { value: null, valid: false, error: error.message, elapsedMs: Date.now() - started }; }
}

function withinBudget(result) {
  return result.model === protocol.model && Number.isInteger(result.inputTokens)
    && result.inputTokens > 0 && result.inputTokens <= protocol.maximumInputTokens
    && Number.isInteger(result.outputTokens) && result.outputTokens <= protocol.maximumOutputTokens;
}

module.exports = { describe: legacy.describe, ready: legacy.ready, request, attempt, withinBudget };
