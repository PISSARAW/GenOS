'use strict';
const fs = require('node:fs');
const protocol = require('./config.cjs');
const { hash } = require('./corpus.cjs');
const contracts = require('./contracts.cjs');
const application = require('./application-contract.cjs');

async function ready() {
  const response = await fetch(protocol.endpoint + '/health', { signal: AbortSignal.timeout(5000) });
  if (!response.ok) throw Error('REAL_LLM_NOT_READY');
  const chatTemplateHash = await checkTemplate();
  const result = await call({ mode: 'technical-readiness', request: 'Return JSON with ready=true; no experimental task.' });
  if (result.value?.ready !== true) throw Error('REAL_LLM_PREFLIGHT_RESPONSE_INVALID');
  return { ...result, chatTemplateHash };
}

async function checkTemplate() {
  const response = await fetch(protocol.endpoint + '/apply-template', {
    method: 'POST', headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(5000),
    body: JSON.stringify({ messages: [{ role: 'system', content: 'SYSTEM_MARKER\nSECOND_SYSTEM_LINE' }, { role: 'user', content: 'USER_MARKER' }] }) });
  if (!response.ok) throw Error('CHAT_TEMPLATE_NOT_VERIFIABLE');
  const body = await response.json();
  if (!body.prompt.includes('SYSTEM_MARKER\nSECOND_SYSTEM_LINE') || body.prompt.includes('\\n')
    || body.prompt.indexOf('USER_MARKER') < body.prompt.indexOf('SYSTEM_MARKER')) {
    throw Error('CHAT_TEMPLATE_ESCAPED_NEWLINES');
  }
  return hash(body.prompt);
}

async function call(prompt) {
  const started = performance.now();
  const requestBody = request(prompt);
  const response = await fetch(protocol.endpoint + '/v1/chat/completions', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    signal: AbortSignal.timeout(protocol.maximumRequestMs),
    body: JSON.stringify(requestBody)
  });
  if (!response.ok) throw Error(`HTTP_${response.status}: ${(await response.text()).slice(0, 300)}`);
  const body = await response.json();
  const raw = body.choices?.[0]?.message?.content;
  const usage = body.usage;
  if (body.model !== protocol.modelAlias || !usage?.prompt_tokens || !usage?.completion_tokens) throw Error('MODEL_OR_USAGE_MISSING');
  if (usage.prompt_tokens > protocol.maximumInputTokens || usage.completion_tokens > protocol.maximumOutputTokens) throw Error('TOKEN_BUDGET_EXCEEDED');
  let value = null;
  try { value = JSON.parse(raw); } catch (_) { /* Invalid outputs remain failures. */ }
  return { raw, value, usage, finishReason: body.choices[0].finish_reason,
    model: body.model, elapsedMs: Math.round(performance.now() - started), requestMessages: requestBody.messages, request: requestBody };
}

function request(prompt) {
  return { model: protocol.modelAlias, stream: false, temperature: protocol.temperature,
    seed: parseInt(hash(prompt).slice(0, 7), 16), max_tokens: protocol.maximumOutputTokens,
    response_format: prompt.mode === 'technical-readiness' ? { type: 'json_object' }
      : { type: 'json_object', schema: contracts.schema(prompt) }, cache_prompt: true,
    id_slot: ['identity','identity-probe'].includes(prompt.mode) ? 0 : 1, messages: messages(prompt) };
}

function messages(prompt) {
  const programMode = ['learn','evaluate'].includes(prompt.mode);
  const content = programMode ? executionMessage(prompt) : JSON.stringify(prompt);
  return [{ role: 'system', content: contracts.instruction(prompt) }, { role: 'user', content }];
}

function executionMessage(prompt) {
  const program = application.message(prompt.applicationPlan);
  if (prompt.mode !== 'learn') return program;
  return program + '\n\nFeedback for learning about the previous task, separate from this expression:\n'
    + JSON.stringify(prompt.feedback);
}

async function attempt(prompt) {
  try { return await call(prompt); }
  catch (error) { return { value: null, error: error.message, usage: null, requestMessages: messages(prompt), request: request(prompt) }; }
}

function log(directory, event) {
  const statePath = directory + '/journal-state.json';
  const previous = fs.existsSync(statePath) ? JSON.parse(fs.readFileSync(statePath, 'utf8')) : { index: -1, hash: null };
  const payload = { index: previous.index + 1, previous: previous.hash, at: new Date().toISOString(), ...event };
  const entry = { ...payload, hash: hash(payload) };
  fs.appendFileSync(directory + '/events.jsonl', JSON.stringify(entry) + '\n');
  fs.writeFileSync(statePath, JSON.stringify({ index: entry.index, hash: entry.hash }));
}

module.exports = { ready, call, attempt, log, messages, request };
