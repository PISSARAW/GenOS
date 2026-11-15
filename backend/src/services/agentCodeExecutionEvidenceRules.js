'use strict';

function shouldAttachTestReceipt(context) {
  return (context.citesTest || context.describesTest) && !context.evidence.includes(context.receiptRef);
}

function selectAttestedTest(context) {
  return context.verified.find((item) => item.command === context.reportedTestCommand(context.test) && item.passed === context.test.passed) || context.test;
}

function recordCompletedCommand(context) {
  return context.event.payload?.type !== 'item.completed' || context.item?.type !== 'command_execution'
      || context.item.status !== 'completed' || context.item.exit_code !== 0 || typeof context.item.command !== 'string';
}

function reportedTestCommand(context) {
  return context.name.match(/\b(?:npm\s+(?:test|run\s+test)|yarn\s+test|pnpm\s+test|pytest(?:\s+[^\s]+)?|node\s+[^\s]+\.(?:c?js|mjs))\b/i)?.[0] || '';
}

module.exports = { shouldAttachTestReceipt, selectAttestedTest, recordCompletedCommand, reportedTestCommand };
