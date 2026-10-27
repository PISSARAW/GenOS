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

function createModelWorker({ ledger, model, observation }) {
  return {
    async solve(request) {
      const { value } = await ledger.generateJson({ model,
        prompt: solutionPrompt(request, observation), seed: request.executionId, maxTokens: 128 });
      if (typeof value.answerId !== 'string') throw new Error('Model omitted answerId.');
      const refs = Array.isArray(value.evidenceRefs) ? value.evidenceRefs : [];
      return { proposal: { hypothesis: request.question.hypothesis,
        method: request.question.method, falsifier: request.question.falsifier },
        evidenceRefs: [`ett-answer:${value.answerId}`, ...refs] };
    }
  };
}

module.exports = { DEFAULT_MODEL, createLedger, questionGenerator, createModelWorker };
