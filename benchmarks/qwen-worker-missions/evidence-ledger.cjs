'use strict';
const known = row => row.token_usage_source === 'provider'
  && [row.input_tokens, row.output_tokens].every(value => Number.isSafeInteger(value) && value >= 0);

function totals(rows) {
  const input = rows.reduce((sum, row) => sum + row.input_tokens, 0);
  const output = rows.reduce((sum, row) => sum + row.output_tokens, 0);
  return { input_tokens: input, output_tokens: output, tokens: input + output };
}

function usageMatches(usage, total) {
  return usage?.tokens === total.tokens && Object.entries(total).every(([key, value]) =>
    usage[key] === undefined || usage[key] === value);
}

function consistent(input, total) {
  let metrics;
  try { metrics = JSON.parse(input.run.metrics_json || '{}'); } catch { return false; }
  return Number.isSafeInteger(total.tokens) && total.tokens > 0
    && metrics.tokens === total.tokens && usageMatches(input.terminal.usage, total);
}

function producerMatches(input) {
  return input.terminal.provider === 'ollama' && input.terminal.model === input.expectedModel;
}

function completeLedger(rows, called) {
  const ids = rows.map(row => row.id);
  return called.every(known) && ids.every(id => typeof id === 'string' && id.length > 0)
    && new Set(ids).size === ids.length;
}

function measuredInvocation(input, evidence) {
  return evidence.complete && /^ollama:\/\/qwen/i.test(input.expectedModel || '')
    && evidence.expected.length > 0 && consistent(input, evidence.total);
}

function measurement(inspection, input) {
  if (!Array.isArray(inspection.modelAttempts)) return null;
  const rows = inspection.modelAttempts.filter(row => row.agent_id === input.workerId && row.mission_id === input.run.id);
  const called = rows.filter(row => row.provider_called === 1);
  const complete = completeLedger(rows, called);
  const measured = called.filter(known);
  const total = totals(measured);
  const expected = measured.filter(row => row.model === input.expectedModel);
  const invocation = measuredInvocation(input, { complete, expected, total });
  const producer = invocation && producerMatches(input);
  const qualifies = invocation && (input.terminal.type !== 'AGENT_COMPLETED' || producer);
  return { modelInvocationMeasured: qualifies, terminalResponseMeasured: producer,
    measurement: { basis: 'exact_worker_run_ledger', complete, providerCalls: called.length,
      expectedModelCalls: expected.length, measuredTokens: total.tokens },
    ...(!qualifies ? { reason: refusalReason({ complete, invocation, producer }, input) } : {}) };
}

function refusalReason(state, input) {
  if (!state.complete) return 'Provider attempt ledger is incomplete or contains ambiguous attempt identities.';
  if (!state.invocation) return 'No consistent measured Qwen invocation in the exact intended worker run.';
  if (input.terminal.type === 'AGENT_COMPLETED' && !state.producer) return 'Completed report producer is not attributed to the requested Qwen model.';
  return 'The intended run has no exploitable measurement.';
}

module.exports = { measurement };
