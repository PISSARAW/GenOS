'use strict';

const crypto = require('node:crypto');
const { repairPlan } = require('./workerCodeTestRepairRules');

function failureOutput(error) {
  return (error?.proposal?.tests || []).map((test) => `${test.stdout || ''}\n${test.stderr || ''}`).join('\n');
}
function normalizeDiagnostic(value) {
  return String(value || '').replace(/\u001b\[[0-9;]*m/g, '')
    .replace(/[A-Z]:\\[^\s:'"`]+/gi, '<path>')
    .replace(/\bpid[=: ]+\d+\b/gi, 'pid=<n>')
    .replace(/\s+/g, ' ').trim().toLowerCase().slice(0, 500);
}
function failureSignature(error) {
  const test = error?.proposal?.tests?.[0] || {};
  const output = failureOutput(error);
  const count = output.match(/(\d+)\s*!==\s*(\d+)[\s\S]*?acceptance\.cjs:(\d+):/i);
  let diagnostic;
  if (count) diagnostic = `assertion-count@${count[3]}:${count[1]}!==${count[2]}`;
  else if (/strict mode violation|resolved to \d+ elements/i.test(output)) {
    const locator = output.split(/\r?\n/).find((line) => /getBy(?:Label|Role|Text|Placeholder|TestId)\s*\(/i.test(line));
    diagnostic = `strict-locator:${normalizeDiagnostic(locator || output.match(/strict mode violation[^\r\n]*/i)?.[0] || output)}`;
  } else {
    const assertion = output.match(/(?:AssertionError[^\r\n]*|locator\.[^\r\n]*|Error:[^\r\n]*|acceptance\.cjs:\d+:\d+)/i);
    diagnostic = normalizeDiagnostic(assertion?.[0] || error?.workerArtifactDiagnostics?.error || error?.message || error?.code);
  }
  const numericExitCode = Number(test.exitCode);
  const exitCode = test.exitCode == null || test.exitCode === '' ? null
    : Number.isInteger(numericExitCode) ? numericExitCode : String(test.exitCode).trim();
  return JSON.stringify({ command: normalizeDiagnostic(test.command || ''), exitCode,
    code: String(error?.code || ''), diagnostic });
}
function candidateDigest(error) {
  const patches = error?.proposal?.failedPatchContents;
  if (!Array.isArray(patches) || !patches.length) return null;
  const candidate = patches.map((patch) => ({ path: String(patch.path || ''), content: String(patch.content || '') }))
    .sort((left, right) => left.path.localeCompare(right.path));
  return crypto.createHash('sha256').update(JSON.stringify(candidate)).digest('hex');
}
function appliedPlanIds(mission, error) {
  const plans = [...(mission?.codeRepairPlans || (mission?.codeRepairPlan ? [mission.codeRepairPlan] : []))];
  const nextPlan = repairPlan(error);
  if (nextPlan) plans.push(nextPlan);
  return [...new Set(plans.filter((item) => item?.kind)
    .map((item) => `${item.kind}:${String(item.label || '').trim().toLowerCase()}`))].sort();
}
function noProgressError(error, progress) {
  return Object.assign(new Error(`Stopped local code repair after ${progress.identicalFailures} identical failures with no new assertion or repair strategy.`), {
    code: 'WORKER_TEST_REPAIR_NO_PROGRESS', originalError: error, proposal: error.proposal,
    workerArtifactDiagnostics: error.workerArtifactDiagnostics, usage: error.usage,
    repairProgress: progress
  });
}

module.exports = { failureSignature, candidateDigest, appliedPlanIds, noProgressError };
