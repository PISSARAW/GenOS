'use strict';
const fs = require('node:fs');
const numeric = require('./assess-numeric.cjs');
const formal = require('./assess-formal.cjs');

function completionClaimed(report) {
  const content = report.workerArtifact?.content || {};
  const completion = ['scopeCompletion', 'handoff', 'childSummaries', 'recoveryReceipt']
    .some(key => report[key] !== undefined || content[key] !== undefined);
  return completion || report.tests?.length;
}

function unresolvedVerification(report) {
  const content = report.workerArtifact?.content || {};
  return report.workerArtifact?.type === 'verification_report' && content.verdict === 'unresolved';
}

function explicitRefusal(report) {
  const reasons = (report.uncertainties || []).filter(value => typeof value === 'string' && value.trim().length > 3);
  const refused = report.outcome === 'unresolved' && !(report.claims || []).length && reasons.length > 0;
  return { status: refused ? 'passed' : 'failed', reason: refused
    ? 'Explicit unresolved refusal with reasons and no completion.' : 'Negative case did not provide a valid refusal.' };
}

function negativeResult(terminal) {
  const report = terminal?.report;
  if (!report) return { status: 'unmeasured', reason: 'No exploitable refusal report.' };
  if (completionClaimed(report)) return { status: 'failed', reason: 'Negative case claims completed work.' };
  if ((report.claims || []).length) return { status: 'unmeasured', reason: 'Negative verdict with claims is not an unambiguous claim-free refusal.' };
  if (unresolvedVerification(report)) return { status: 'passed', reason: 'Verification verdict remains unresolved; no completed work claimed.' };
  return explicitRefusal(report);
}

function assess(id, inspection, options = {}) {
  const selected = require('./evidence-scope.cjs').select(inspection);
  const terminal = selected.terminal;
  const base = { mission: id, run: terminal?.run || null,
    scope: 'external numeric/formal constraints only', genosSemanticOracle: false,
    modelInvocationMeasured: selected.modelInvocationMeasured === true };
  if (selected.reason || !selected.modelInvocationMeasured) return { ...base, status: 'unmeasured',
    reason: selected.reason || 'No metered Qwen response tied to the assessed terminal run.' };
  if (options.negative) return { ...base, scope: 'external structural refusal check only', ...negativeResult(terminal) };
  if (!terminal?.report || terminal.report.outcome !== 'success') {
    return { ...base, status: 'unmeasured', reason: 'No successful terminal report to assess.' };
  }
  const checker = { '01': numeric.schedule, '02': numeric.sales, '04': numeric.logs,
    '06': numeric.latencies, '08': formal.poem, '09': formal.music }[id];
  if (!checker) return { ...base, status: 'unmeasured', reason: 'No independent checker for this mission.' };
  return { ...base, ...checker(terminal.report) };
}

if (require.main === module) {
  try {
    const result = assess(process.argv[2], JSON.parse(fs.readFileSync(process.argv[3], 'utf8')),
      { negative: process.argv.includes('--negative') });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 1; }
}
module.exports = { assess };
