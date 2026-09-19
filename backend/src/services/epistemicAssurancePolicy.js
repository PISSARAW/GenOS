'use strict';

const assurance = require('./epistemicAssuranceService');

function assemblyFrom(executionContext) {
  if (executionContext.epistemicAssembly) return executionContext.epistemicAssembly;
  return executionContext.report?.epistemicAssembly;
}

function missingAssemblyViolation() {
  return [{
    policy: 'require_epistemic_assurance',
    message: 'Contract requires a complete epistemic assurance assembly before promotion.'
  }];
}

function evaluate(policy, executionContext) {
  if (!policy.require_epistemic_assurance) return [];
  const assembly = assemblyFrom(executionContext);
  if (!assembly) return missingAssemblyViolation();
  const protectedAssembly = {
    ...assembly,
    trustedVerifierDigests: policy.epistemic_verifier_digests || []
  };
  const evaluation = assurance.evaluateEpistemicAssurance(protectedAssembly);
  if (evaluation.eligible) return [];
  return evaluation.violations.map((item) => ({
    ...item,
    policy: `require_epistemic_assurance.${item.policy}`
  }));
}

module.exports = { evaluate };
