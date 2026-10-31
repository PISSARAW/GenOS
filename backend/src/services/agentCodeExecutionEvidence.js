'use strict';

const crypto = require('node:crypto');
const { normalizeSandboxCommand } = require('./sandboxCommandPolicy');

function recordCompletedCommand(state, event, eventType) {
  if (eventType === 'CODE_TEST_SUITE_RECEIPT') require('./agentCodeTestWitness').recordSuite(state, event);
  if (eventType !== 'AGENT_STEP' || event.action !== 'command_execution') return;
  const item = event.payload?.item;
  if (require('./agentCodeExecutionEvidenceValues1.js').recordCompletedCommandValue3({ event, item })) return;
  const output = String(item.aggregated_output || '');
  state.missionDomainState.completedCommands ||= [];
  state.missionDomainState.completedCommands.push({
    eventId: event.id || null, itemId: item.id || null, command: item.command, exitCode: 0,
    stdout: output.slice(0, 4000),
    outputDigest: crypto.createHash('sha256').update(output).digest('hex')
  });
}

function attestCodeTestResults(report, state) {
  if (!Array.isArray(report.tests)) return { executedTests: [] };
  const completedCommands = state.missionDomainState.completedCommands || [];
  const verified = [];
  for (const test of report.tests) {
    if (test?.passed !== true) continue;
    const expected = reportedTestCommand(test).toLowerCase();
    if (!expected) continue;
    const execution = [...completedCommands].reverse().find((candidate) =>
      candidate.exitCode === 0 && normalizeSandboxCommand(candidate.command).toLowerCase() === expected);
    if (!execution) continue;
    const attested = { ...test, command: expected, exitCode: 0, stdout: execution.stdout || '', stderr: '', executionReceipt: {
      eventId: execution.eventId, itemId: execution.itemId, command: execution.command,
      exitCode: execution.exitCode, outputDigest: execution.outputDigest
    } };
    const digest = require('./trinityProvenanceValues').digest(attested);
    const receiptRef = `genos://code-test/${digest}`;
    require('./agentCodeExecutionEvidenceStages1.js').attestCodeTestResultsStage1({ Array, String, expected, receiptRef, get report() { return report; }, set report(__genosNextStageValue) { report = __genosNextStageValue; }, require, test });
    verified.push(attested);
  }
  if (verified.length) report.tests = report.tests.map((test) =>
    require('./agentCodeExecutionEvidenceValues1.js').attestCodeTestResultsValue2({ reportedTestCommand, test, verified }));
  return { executedTests: [...verified, ...require('./agentCodeTestWitness').witnessedTests(report, state)] };
}

function verifiedTestResults(report, state) {
  const completed = state?.missionDomainState?.completedCommands || [];
  return (report?.tests || []).filter((test) => test?.passed === true && test.exitCode === 0
    && test.executionReceipt?.exitCode === 0 && completed.some((command) =>
      command.eventId === test.executionReceipt.eventId && command.itemId === test.executionReceipt.itemId
      && command.exitCode === 0 && command.outputDigest === test.executionReceipt.outputDigest
      && command.command === test.executionReceipt.command))
    .map((test) => ({ command: reportedTestCommand(test), exitCode: 0, signal: null, stdout: '', stderr: '' }))
    .filter((test) => test.command);
}

async function persistVerifiedTestReceipt(ctx, event) {
  if (event.eventType !== 'EVIDENCE_REPORT') return null;
  const report = event.payload?.evidenceReport || event.payload?.report || event.payload;
  if (report?.outcome !== 'success') return null;
  const tests = verifiedTestResults(report, ctx.state);
  if (!tests.length) return null;
  return require('./localCodeTestExecutionReceiptService').recordFromWorkspace(ctx.db, {
    missionId: ctx.normalizedMission.missionId || ctx.normalizedMission.mission_id,
    agentId: ctx.agentId, executionRunId: ctx.executionRun.id,
    workspaceRoot: ctx.workspaceRoot, tests
  });
}

function reportedTestCommand(test) {
  if (typeof test?.command === 'string' && test.command.trim()) return test.command.trim();
  const name = String(test?.name || '').trim();
  return require('./agentCodeExecutionEvidenceValues1.js').reportedTestCommandValue4({ name });
}

module.exports = { recordCompletedCommand, attestCodeTestResults, verifiedTestResults, persistVerifiedTestReceipt };
