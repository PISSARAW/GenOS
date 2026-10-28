'use strict';

const modelProvider = require('../../../backend/src/services/modelProvider');

const DEFAULT_MODEL = 'ollama://qwen2.5-coder:7b';

function createLedger() {
  const calls = [];
  const callHistory = [];
  const totals = { tokens: 0, usd: 0, seconds: 0, measured: true, calls: 0 };
  return {
    calls,
    async generateJson({ model = DEFAULT_MODEL, prompt, seed, maxTokens = 128 }) {
      const started = process.hrtime.bigint();
      const response = await modelProvider.generate({ model, prompt, seed,
        temperature: 0, stream: false, enforceSchema: false, maxTokens, timeoutMs: 120000 });
      const row = { model: response.servedModel || model, provider: response.provider,
        inputTokens: response.inputTokens, outputTokens: response.outputTokens,
        measured: response.tokenUsageMeasured === true,
        elapsedMs: Number(process.hrtime.bigint() - started) / 1e6 };
      calls.push(row);
      callHistory.push(row);
      totals.tokens += row.inputTokens + row.outputTokens;
      totals.seconds += Math.ceil(row.elapsedMs / 1000);
      totals.calls += 1;
      totals.measured &&= row.measured;
      return { value: parseJson(response.text), usage: row };
    },
    takeSnapshot() {
      const snapshot = calls.splice(0, calls.length);
      return snapshot.reduce((total, row) => ({
        tokens: total.tokens + row.inputTokens + row.outputTokens,
        usd: total.usd,
        seconds: total.seconds + Math.ceil(row.elapsedMs / 1000),
        measured: total.measured && row.measured,
        calls: total.calls + 1
      }), { tokens: 0, usd: 0, seconds: 0, measured: true, calls: 0 });
    },
    summary: () => ({ ...totals, callDetails: [...callHistory] })
  };
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
    const { value } = await ledger.generateJson({ model, prompt, maxTokens: 128 });
    return value;
  };
}

function solutionPrompt(request, observation) {
  return ['Select the best candidate using the task objective and public evidence.',
    `Question: ${request.question.text}`, `Hypothesis: ${request.question.hypothesis}`,
    `Task: ${JSON.stringify(observation)}`,
    'Return only JSON: {"answerId":"candidate-id","evidenceRefs":["candidate-id:metric"],"reason":"short"}.'].join('\n');
}

function applyWorkerAction(world, value) {
  if (value.action?.type === 'inspect_candidate') return world.act(value.action);
  if (value.action?.type === 'submit_answer') return world.act(value.action);
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
      'Return JSON with either action {type:"inspect_candidate",candidateId:"candidate-N"} or action {type:"submit_answer",answerId:"candidate-N"}. Inspect evidence before submitting.'].join('\n');
    const result = await input.ledger.generateJson({ model: input.model, prompt,
      seed: `${input.request.executionId}:${turn}`, maxTokens: 128 });
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
  evidenceRefs: [`ett-answer:${answerId}`, ...(input.worldResult?.evidenceRefs || []), ...refs] };
}

function createModelWorker(input) {
  return { solve: (request) => runWorkerTurns({ ...input, request }) };
}

module.exports = { DEFAULT_MODEL, createLedger, questionGenerator, createModelWorker };
