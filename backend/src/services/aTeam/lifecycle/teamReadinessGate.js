'use strict';

function collectResponsibilities(contract) {
  return new Set(contract.members.flatMap((member) => member.responsibilities));
}

function unresolvedDependencies(contract) {
  const known = new Set(contract.members.map((member) => member.memberId));
  return contract.members.flatMap((member) => member.consumes.filter((dependency) => !known.has(dependency)));
}

function evaluateReadiness(contract, options = {}) {
  const responsibilities = collectResponsibilities(contract);
  const dependencies = unresolvedDependencies(contract);
  const required = Array.isArray(options.requiredCapabilities) ? options.requiredCapabilities : [];
  const gaps = required.filter((item) => !responsibilities.has(String(item.capability || item.name)));
  const availableSlots = options.availableSlots;
  const checks = {
    goal: Boolean(contract.goal),
    successCriteria: contract.successCriteria.length > 0,
    teamSize: contract.members.length >= 2,
    ownership: contract.members.every((member) => member.responsibilities.length > 0),
    dependencies: dependencies.length === 0,
    capabilities: gaps.length === 0,
    capacity: availableSlots === undefined || Number(availableSlots) >= contract.members.length
  };
  const blockers = Object.entries(checks).filter(([, passed]) => !passed).map(([name]) => name);
  return { status: blockers.length ? 'BLOCKED' : 'TEAM_READY', ready: blockers.length === 0, checks, blockers, uncoveredCapabilities: gaps.map((item) => item.capability || item.name), unresolvedDependencies: dependencies };
}

module.exports = { evaluateReadiness };
