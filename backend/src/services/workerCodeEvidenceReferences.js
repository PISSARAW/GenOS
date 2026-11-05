'use strict';

const { digest } = require('./trinityProvenanceValues');

function testPassed(test) {
  return test.exitCode === 0 && !test.timedOut && !test.signal;
}

function references(proposal = {}) {
  const files = (proposal.changedFileHashes || []).map(file => `genos://code-file/${digest(file)}`);
  const tests = (proposal.tests || []).filter(testPassed).map(test => `genos://code-test/${digest(test)}`);
  const receipt = proposal.testExecutionReceipt?.receiptHash;
  const batch = typeof receipt === 'string' && /^[a-f0-9]{64}$/.test(receipt)
    ? [`genos://code-test-execution/${receipt}`] : [];
  return [...files, ...tests, ...batch, ...require('./codeBoundaryEvidence').references(proposal)];
}

function tests(proposal) {
  return (proposal.tests || []).map(test => ({ ...test, passed: testPassed(test),
    evidence: [`genos://code-test/${digest(test)}`] }));
}

module.exports = { references, tests, testPassed };
