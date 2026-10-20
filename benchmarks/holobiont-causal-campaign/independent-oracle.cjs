'use strict';

const ORACLE_ID = 'holobiont-bounded-sum-oracle/v1';

function expectedValue(testCase) {
  if (testCase?.operation !== 'bounded-sum' || !Array.isArray(testCase.values)
    || testCase.values.some((value) => !Number.isSafeInteger(value))) {
    throw Object.assign(new Error('Oracle case is outside the bounded-sum domain.'), {
      code: 'HOLOBIONT_CAUSAL_ORACLE_DOMAIN_INVALID'
    });
  }
  return testCase.values.reduce((total, value) => total + value, 0);
}

function evaluate(testCase, observed) {
  const expected = expectedValue(testCase);
  const declaredExpectedMatches = testCase.expected === expected;
  const observedMatches = observed?.value === expected;
  return {
    oracleId: ORACLE_ID,
    status: declaredExpectedMatches && observedMatches ? 'PASS' : 'FAIL',
    expected,
    observed: observed?.value ?? null,
    declaredExpectedMatches,
    observedMatches
  };
}

module.exports = { ORACLE_ID, evaluate, expectedValue };
