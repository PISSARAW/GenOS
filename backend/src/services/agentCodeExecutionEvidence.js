'use strict';

const crypto = require('node:crypto');

function recordCompletedCommand(state, event, eventType) {
  if (eventType !== 'AGENT_STEP' || event.action !== 'command_execution') return;
  const item = event.payload?.item;
  if (event.payload?.type !== 'item.completed' || item?.type !== 'command_execution'
      || item.status !== 'completed' || item.exit_code !== 0 || typeof item.command !== 'string') return;
  const output = String(item.aggregated_output || '');
  state.missionDomainState.completedCommands ||= [];
  state.missionDomainState.completedCommands.push({
    eventId: event.id || null, itemId: item.id || null, command: item.command, exitCode: 0,
    outputDigest: crypto.createHash('sha256').update(output).digest('hex')
  });
}

function attestCodeTestResults(report, state) {
  if (!Array.isArray(report.tests) || !Array.isArray(state.missionDomainState.completedCommands)) return;
  const completedCommands = state.missionDomainState.completedCommands;
  const verified = [];
  for (const test of report.tests) {
    if (test?.passed !== true) continue;
    const expected = reportedTestCommand(test).toLowerCase();
    if (!expected) continue;
    const execution = [...completedCommands].reverse().find((candidate) =>
      candidate.exitCode === 0 && candidate.command.toLowerCase().includes(expected));
    if (!execution) continue;
    const attested = { ...test, command: expected, exitCode: 0, executionReceipt: {
      eventId: execution.eventId, itemId: execution.itemId, command: execution.command,
      exitCode: execution.exitCode, outputDigest: execution.outputDigest
    } };
    const digest = require('./trinityProvenanceValues').digest(attested);
    const receiptRef = `genos://code-test/${digest}`;
    for (const claim of report.claims || []) {
      const evidence = Array.isArray(claim?.evidence) ? claim.evidence : [];
      const testEvidence = Array.isArray(test.evidenceRefs) ? test.evidenceRefs : [];
      const citesTest = testEvidence.some((reference) => evidence.includes(reference));
      const describesTest = String(claim?.statement || '').toLowerCase().includes(expected);
      if ((citesTest || describesTest) && !evidence.includes(receiptRef)) {
        claim.evidence = [...evidence, receiptRef];
      }
    }
    verified.push(attested);
  }
  if (verified.length) report.tests = report.tests.map((test) =>
    verified.find((item) => item.command === reportedTestCommand(test) && item.passed === test.passed) || test);
}

function reportedTestCommand(test) {
  if (typeof test?.command === 'string' && test.command.trim()) return test.command.trim();
  const name = String(test?.name || '').trim();
  return name.match(/\b(?:npm\s+(?:test|run\s+test)|yarn\s+test|pnpm\s+test|pytest(?:\s+[^\s]+)?|node\s+[^\s]+\.(?:c?js|mjs))\b/i)?.[0] || '';
}

module.exports = { recordCompletedCommand, attestCodeTestResults };
