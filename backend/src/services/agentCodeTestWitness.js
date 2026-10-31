'use strict';

const receipts = require('./codeTestExecutionReceipt');
const { digest } = require('./trinityProvenanceValues');

function recordSuite(state, event) {
  const owner = state.missionDomainState.workerId;
  if (owner && event.agentId !== owner) return;
  const stored = { event_type: event.eventType, agent_id: event.agentId,
    action: event.action, payload_json: JSON.stringify(event.payload || {}) };
  if (!receipts.isPassingReceipt(stored, state.missionDomainState.missionId)) return;
  state.missionDomainState.testProofs ||= [];
  state.missionDomainState.testProofs.push(...event.payload.proofs);
}

function witnessedTests(report, state) {
  const domain = state.missionDomainState;
  const proofs = domain.testProofs || [];
  return (report.tests || []).filter(test => test?.exitCode === 0
    && proofs.some(proof => proof.digest === digest(test)));
}

function failedTest(test) {
  if (!test || typeof test !== 'object') return false;
  return (Number.isInteger(test.exitCode) && test.exitCode !== 0)
    || test.passed === false || test.executed === false || Boolean(test.signal || test.timedOut);
}

function assertNoFailedTests(report) {
  const tests = [...(report.tests || []), ...(report.workerArtifact?.content?.tests || [])];
  if (!tests.some(failedTest)) return;
  throw Object.assign(new Error('Worker report contains failed or refused tests.'), { code: 'WORKER_TESTS_FAILED' });
}

module.exports = { recordSuite, witnessedTests, assertNoFailedTests };
