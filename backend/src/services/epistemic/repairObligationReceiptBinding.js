'use strict';

const { isDeepStrictEqual } = require('node:util');
const contracts = require('./repairObligationContract');
const values = require('../trinityProvenanceValues');

function invalid() { throw values.failure('REPAIR_OBLIGATION_RECEIPT_BINDING_MISMATCH'); }

function assert(execution, subject) {
  if (subject.content.contract.kind !== contracts.KIND) return;
  const expected = contracts.binding(subject.content);
  const coverage = execution.postconditions?.coverage;
  if (!coverage || coverage.complete !== true) invalid();
  for (const field of ['schema', 'scope', 'contractHash', 'artifactContentHash', 'baselineContentHash', 'suiteContentHash']) {
    if (coverage[field] !== expected[field]) invalid();
  }
  const count = subject.content.contract.mutants.length;
  if (coverage.checkedMutants !== count || coverage.totalMutants !== count) invalid();
  if (!Array.isArray(coverage.obligations) || coverage.obligations.length !== expected.obligations.length) invalid();
  expected.obligations.forEach((obligation, index) => assertObligation(coverage.obligations[index], obligation));
}

function assertObligation(actual, expected) {
  for (const field of ['id', 'mode', 'totalCases']) if (actual?.[field] !== expected[field]) invalid();
  if (actual.status !== 'verified' || actual.checkedCases !== expected.totalCases || actual.candidateFailures !== 0) invalid();
  assertBaseline(actual, expected);
  if (!isDeepStrictEqual(actual.mutantIds, expected.mutantIds)
      || !isDeepStrictEqual(actual.killedMutantIds, expected.mutantIds)) invalid();
}

function assertBaseline(actual, expected) {
  if (actual.baselineEstablished !== true || !Number.isInteger(actual.baselineFailures)) invalid();
  if (actual.baselineFailures < 0 || actual.baselineFailures > expected.totalCases) invalid();
  if (expected.mode === 'regression' ? actual.baselineFailures === 0 : actual.baselineFailures !== 0) invalid();
}

module.exports = { assert };
