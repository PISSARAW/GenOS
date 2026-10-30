'use strict';

function attestCodeTestResultsValue1(__genosValueScope1) {
  return (__genosValueScope1.citesTest || __genosValueScope1.describesTest) && !__genosValueScope1.evidence.includes(__genosValueScope1.receiptRef);
}

function attestCodeTestResultsValue2(__genosValueScope2) {
  return __genosValueScope2.verified.find((item) => item.command === (0, __genosValueScope2.reportedTestCommand)(__genosValueScope2.test) && item.passed === __genosValueScope2.test.passed) || __genosValueScope2.test;
}

function recordCompletedCommandValue3(__genosValueScope3) {
  return __genosValueScope3.event.payload?.type !== 'item.completed' || __genosValueScope3.item?.type !== 'command_execution'
      || __genosValueScope3.item.status !== 'completed' || __genosValueScope3.item.exit_code !== 0 || typeof __genosValueScope3.item.command !== 'string';
}

function reportedTestCommandValue4(__genosValueScope4) {
  return __genosValueScope4.name.match(/\b(?:npm\s+(?:test|run\s+test)|yarn\s+test|pnpm\s+test|pytest(?:\s+[^\s]+)?|node\s+[^\s]+\.(?:c?js|mjs))\b/i)?.[0] || '';
}

module.exports = { attestCodeTestResultsValue1, attestCodeTestResultsValue2, recordCompletedCommandValue3, reportedTestCommandValue4 };
