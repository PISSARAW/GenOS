'use strict';

const modelProvider = require('../../../backend/src/services/modelProvider');

const DEFAULT_MODEL = 'ollama://qwen2.5-coder:7b';

function ledgerRow(response, model, elapsedMs) {
  return { model: response.servedModel || model, provider: response.provider,
    inputTokens: response.inputTokens, outputTokens: response.outputTokens,
    measured: response.tokenUsageMeasured === true
      && Number.isSafeInteger(response.inputTokens) && response.inputTokens >= 0
      && Number.isSafeInteger(response.outputTokens) && response.outputTokens >= 0, elapsedMs };
}

function updateTotals(state, row) {
  state.calls.push(row);
  state.callHistory.push(row);
  if (row.measured) state.totals.tokens += row.inputTokens + row.outputTokens;
  state.totals.seconds += Math.ceil(row.elapsedMs / 1000);
  state.totals.calls += 1;
  state.totals.measured &&= row.measured;
}

async function generateResponse(input) {
  const { options, state, request } = input;
  const { model = DEFAULT_MODEL, prompt, seed, maxTokens = 128, callContext } = request;
  const started = process.hrtime.bigint();
  const reservation = options.budgetGuard?.beginCall({ prompt, maxTokens,
    callContext: { ...(options.callContext || {}), ...(callContext || {}) } });
  let response;
  try {
    response = await (options.generate || modelProvider.generate)({ model, prompt, seed,
      temperature: 0, stream: false, enforceSchema: false, maxTokens, timeoutMs: 120000 });
  } catch (error) {
    if (reservation) options.budgetGuard.failCall(reservation, error);
    throw error;
  }
  const row = ledgerRow(response, model, Number(process.hrtime.bigint() - started) / 1e6);
  updateTotals(state, row);
  if (reservation) options.budgetGuard.completeCall(reservation, row);
  return { value: parseJson(response.text), usage: row };
}

function takeSnapshot(state) {
  return state.calls.splice(0, state.calls.length).reduce((total, row) => ({
    tokens: total.tokens + (row.measured ? row.inputTokens + row.outputTokens : 0),
    usd: total.usd, seconds: total.seconds + Math.ceil(row.elapsedMs / 1000),
    measured: total.measured && row.measured, calls: total.calls + 1
  }), { tokens: 0, usd: 0, seconds: 0, measured: true, calls: 0 });
}

function createLedger(options = {}) {
  const state = { calls: [], callHistory: [],
    totals: { tokens: 0, usd: 0, seconds: 0, measured: true, calls: 0 } };
  return { calls: state.calls,
    generateJson: (request) => generateResponse({ options, state, request }),
    takeSnapshot: () => takeSnapshot(state),
    summary: () => ({ ...state.totals, callDetails: [...state.callHistory] }) };
}

function parseJson(text) {
  const candidate = String(text || '').match(/\{[\s\S]*\}/)?.[0];
  if (!candidate) {
    const answerId = String(text || '').match(/candidate-[0-9]+/)?.[0];
    return answerId ? { answerId, evidenceRefs: [`${answerId}:response`] }
      : { text: String(text || '').trim() };
  }
  return JSON.parse(candidate);
}

function questionGenerator(ledger, model) {
  return async (input) => {
    const prompt = ['Return JSON with text, hypothesis, falsifier, method.',
      `Observation: ${input.summary}`, `Dimension: ${input.dimension.name}`,
      `Acceptance: ${input.dimension.expected}`, 'Propose one discriminating, read-only test.'].join('\n');
    const { value } = await ledger.generateJson({ model, prompt, maxTokens: 128,
      callContext: { stage: 'endogenous_question_generation' } });
    return value;
  };
}

function solutionPrompt(request, observation) {
  return ['Select the best candidate using the task objective and public evidence.',
    `Question: ${request.question.text}`, `Hypothesis: ${request.question.hypothesis}`,
    `Task: ${JSON.stringify(observation)}`,
    'Use the required action schema from the current environment observation.'].join('\n');
}

function applyWorkerAction(world, value) {
  if (typeof value.action?.type === 'string') return world.act(value.action);
  if (typeof value.answerId === 'string') {
    return world.act({ type: 'submit_answer', answerId: value.answerId });
  }
  return null;
}

async function runWorkerTurns(input) {
  let value = null;
  let latest = null;
  const maxCalls = input.world?.observation.actionBudget || 1;
  for (let turn = 1; turn <= maxCalls; turn += 1) {
    const current = input.world?.observation || input.observation;
    const prompt = [solutionPrompt(input.request, current),
      `Action ${turn}/${maxCalls}. Latest environment response: ${JSON.stringify(latest)}`,
      `Required next action: ${JSON.stringify(current.nextAction)}.`,
      'Return JSON with an action matching the required type and fields. When nextAction is null, submit_answer with an inspected answerId.'].join('\n');
    const result = await input.ledger.generateJson({ model: input.model, prompt,
      seed: `${input.request.executionId}:${turn}`, maxTokens: 128,
      callContext: { stage: 'worker_action', action: turn } });
    value = result.value;
    if (!input.world) break;
    latest = applyWorkerAction(input.world, value);
    if (input.world.terminal) break;
  }
  return workerProposal({ ...input, value, worldResult: input.world?.result() });
}

function workerProposal(input) {
  const answerId = input.worldResult?.answerId || input.value?.answerId;
  if (typeof answerId !== 'string') throw new Error('Model omitted answerId.');
  const refs = Array.isArray(input.value.evidenceRefs) ? input.value.evidenceRefs : [];
  return { proposal: { hypothesis: input.request.question.hypothesis,
    method: input.request.question.method, falsifier: input.request.question.falsifier,
    actions: input.worldResult?.actions || 0 },
  evidenceRefs: [`ett-answer:${answerId}`, ...(input.worldResult?.evidenceRefs || []), ...refs],
  actionTrace: input.worldResult?.trace || [] };
}

function createModelWorker(input) {
  return { solve: (request) => runWorkerTurns({ ...input, request }) };
}

module.exports = { DEFAULT_MODEL, createLedger, questionGenerator, createModelWorker };
