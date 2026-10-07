'use strict';

const HOMEOSTASIS_POLICY_VERSION = 'genos.homeostasis-policy/v2';
const LEGACY_POLICY_VERSION = 'genos.homeostasis-policy/v1';
const DEFAULT_MINIMUM_FUNCTIONAL_COVERAGE = 1;

function resolveHomeostasisPolicy(input = {}) {
  const version = input.policyVersion || HOMEOSTASIS_POLICY_VERSION;
  if (![HOMEOSTASIS_POLICY_VERSION, LEGACY_POLICY_VERSION].includes(version)) {
    throw new Error(`Unsupported homeostasis policy '${version}'`);
  }
  const minimumFunctionalCoverage = input.minimumFunctionalCoverage
    ?? DEFAULT_MINIMUM_FUNCTIONAL_COVERAGE;
  if (resolveHomeostasisPolicyCondition(minimumFunctionalCoverage)) {
    throw new Error('minimumFunctionalCoverage must be a number between 0 and 1');
  }
  const thresholds = { functional: minimumFunctionalCoverage, structural: 1, epistemic: 1, safety: 1 };
  if (version === HOMEOSTASIS_POLICY_VERSION) {
    for (const kind of ['structural', 'epistemic']) {
      thresholds[kind] = coverage(input.classCoverage?.[kind] ?? 1, `classCoverage.${kind}`);
    }
    if (input.classCoverage?.safety !== undefined && input.classCoverage.safety !== 1) {
      throw new Error('Safety coverage must remain 1');
    }
  }
  return { version, minimumFunctionalCoverage, classCoverage: thresholds };
}

function coverage(value, name) {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error(`${name} must be a number between 0 and 1`);
  }
  return value;
}

module.exports = {
  HOMEOSTASIS_POLICY_VERSION,
  LEGACY_POLICY_VERSION,
  DEFAULT_MINIMUM_FUNCTIONAL_COVERAGE,
  resolveHomeostasisPolicy
};

function resolveHomeostasisPolicyCondition(minimumFunctionalCoverage) {
  return !Number.isFinite(minimumFunctionalCoverage)
      || minimumFunctionalCoverage < 0
      || minimumFunctionalCoverage > 1;
}
