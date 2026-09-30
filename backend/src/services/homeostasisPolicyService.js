'use strict';

const HOMEOSTASIS_POLICY_VERSION = 'genos.homeostasis-policy/v1';
const DEFAULT_MINIMUM_FUNCTIONAL_COVERAGE = 1;

function resolveHomeostasisPolicy(input = {}) {
  const minimumFunctionalCoverage = input.minimumFunctionalCoverage
    ?? DEFAULT_MINIMUM_FUNCTIONAL_COVERAGE;
  if (!Number.isFinite(minimumFunctionalCoverage)
      || minimumFunctionalCoverage < 0
      || minimumFunctionalCoverage > 1) {
    throw new Error('minimumFunctionalCoverage must be a number between 0 and 1');
  }
  return {
    version: HOMEOSTASIS_POLICY_VERSION,
    minimumFunctionalCoverage
  };
}

module.exports = {
  HOMEOSTASIS_POLICY_VERSION,
  DEFAULT_MINIMUM_FUNCTIONAL_COVERAGE,
  resolveHomeostasisPolicy
};
