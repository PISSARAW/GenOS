'use strict';

function assert(execution, subject) {
  const code = subject.content;
  const result = execution.postconditions;
  if (!result) fail();
  const coverage = result.coverage;
  if (execution.subject.artifactContentHash !== code.artifact.contentHash || execution.subject.contractHash !== code.contractHash
      || result.artifactContentHash !== code.artifact.contentHash || result.contractHash !== code.contractHash) fail();
  if (coverage?.complete !== true || coverage.expectedCases !== code.contract.cases || coverage.checkedCases !== code.contract.cases) fail();
}

function fail() { throw require('../trinityProvenanceValues').failure('ORACLE_RECEIPT_BINDING_MISMATCH'); }
module.exports = { assert };
