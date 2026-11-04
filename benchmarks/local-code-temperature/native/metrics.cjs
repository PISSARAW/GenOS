'use strict';
const c = require('./common.cjs');
const { statistics } = require('D:/GenOS-Experiments/local-code-temp-20261104/scripts/report.cjs');
function provider(directory) {
  const files = c.fs.readdirSync(directory).filter(n => /^provider-\d+\.json$/.test(n));
  return files.map(n => c.read(c.path.join(directory, n)));
}
function usageOf(traces) {
  if (!traces.length) return null;
  const records = traces.flatMap(t => t.response.trim().split(/\r?\n/).map(line => JSON.parse(line)));
  const finals = records.filter(r => r.done === true);
  if (!finals.length) return null;
  const inputTokens = finals.reduce((sum, r) => sum + r.prompt_eval_count, 0);
  const outputTokens = finals.reduce((sum, r) => sum + r.eval_count, 0);
  return { inputTokens, outputTokens, totalTokens: inputTokens + outputTokens, financialCostUsd: null };
}
function withinBudget(input) {
  const { usage, traces, wallMs } = input;
  return Boolean(usage && usage.totalTokens <= 8192 && usage.outputTokens <= 1536
    && traces.length === 1 && wallMs <= 120000);
}
function failureOf(result) {
  if (result.failure) return result.failure;
  if (result.runtime?.error) return { code: 'NATIVE_WORKER_REFUSED', message: result.runtime.error };
  return null;
}
function score(input) {
  const { manifest, run, directory, wallMs, processResult } = input;
  const file = c.path.join(directory, 'result.json');
  const result = c.fs.existsSync(file) ? c.read(file) : { failure: { code: 'PROCESS_INCOMPLETE' } };
  const traces = provider(directory);
  const usage = usageOf(traces);
  const generationMs = traces.reduce((sum, t) => sum + t.wallMs, 0);
  const budgetValid = withinBudget({ usage, traces, wallMs });
  const row = { ...run, directory, budget: manifest.budget, promotionAllowed: false,
    processExitCode: processResult.status, processError: processResult.error?.message ?? null,
    wallMs, generationMs: traces.length ? generationMs : null, usage, budgetValid,
    providerCalls: traces.length, failure: failureOf(result),
    oracle: result.oracle || null, nativeStatus: result.nativeRun?.status || result.agent?.status || null,
    nativeRunId: result.nativeRun?.id || null, sealedAuthority: Boolean(result.authority?.signature),
    assertionsPassed: result.oracle?.score?.passed || 0,
    assertionsTotal: 12, allTestsPassed: Boolean(budgetValid && result.oracle?.score?.allPassed),
    nativeCompleted: result.nativeReceipt?.result?.verified === true };
  c.write(c.path.join(directory, 'measurement.json'), row);
  return row;
}
function summary(rows) {
  return Object.fromEntries(['baseline', 'temperature020'].map(arm => {
    const selected = rows.filter(r => r.arm === arm);
    return [arm, { planned: 9, recorded: selected.length, candidatePasses: selected.filter(r => r.allTestsPassed).length,
      nativeCompleted: selected.filter(r => r.nativeCompleted).length,
      assertionsPassed: selected.reduce((sum, r) => sum + r.assertionsPassed, 0), assertionsTotal: 108,
      tokens: statistics(selected.map(r => r.usage?.totalTokens)),
      generationMs: statistics(selected.map(r => r.generationMs)), wallMs: statistics(selected.map(r => r.wallMs)),
      comparable: selected.filter(r => r.budgetValid).length, financialCostUsd: null }];
  }));
}
module.exports = { score, summary, provider, usageOf };
