'use strict';

function ratioFor(requirements, predicate) {
  const total = requirements.reduce((sum, item) => sum + (Number(item.weight) || 1), 0);
  const covered = requirements.filter(predicate).reduce((sum, item) => sum + (Number(item.weight) || 1), 0);
  return { ratio: total ? Number((covered / total).toFixed(3)) : null, coveredWeight: covered, requiredWeight: total };
}

function memberHasCapability(members, capability) {
  return members.some((member) => capabilityValues(member).some((value) => String(value).toLowerCase() === capability));
}

function capabilityValues(member) {
  return [
    ...(Array.isArray(member.capabilities) ? member.capabilities : []),
    ...(Array.isArray(member.expertise) ? member.expertise : []), member.domain
  ].filter(Boolean);
}

function capabilityName(item) {
  return String(item.capability || item.name).toLowerCase();
}

function availableTools(member) {
  return [...(Array.isArray(member.availableTools) ? member.availableTools : []), ...(Array.isArray(member.toolLease?.tools) ? member.toolLease.tools : [])];
}

function runtimeMatches(team, capability) {
  return team.some((member) => availableTools(member).some((tool) => String(tool.capability || tool).toLowerCase() === capability));
}

function hasRuntimeData(team) {
  return team.some((member) => Array.isArray(member.availableTools) || Array.isArray(member.toolLease?.tools));
}

function verifiedValue(member, capability) {
  const evidence = member.expertiseEvidence || member.verifiedCapabilities || {};
  return evidence[capability];
}

function isVerified(team, capability) {
  return team.some((member) => {
    const value = verifiedValue(member, capability);
    return value === true || Boolean(value && (value.verified === true || value.status === 'verified') && (value.evidenceRef || value.evidenceId));
  });
}

function coverageSets(list, team) {
  const covered = list.filter((item) => memberHasCapability(team, capabilityName(item)));
  return { covered, uncovered: list.filter((item) => !covered.includes(item)) };
}

function measureCapabilityCoverage(options = {}) {
  const list = Array.isArray(options.requirements) ? options.requirements : [];
  const team = Array.isArray(options.members) ? options.members : [];
  const analysisCoverage = options.analysisCoverage ?? null;
  const staffedCoverage = ratioFor(list, (item) => memberHasCapability(team, capabilityName(item)));
  const runtimeToolCoverage = ratioFor(list, (item) => runtimeMatches(team, capabilityName(item)));
  const verifiedCoverage = ratioFor(list, (item) => isVerified(team, capabilityName(item)));
  const runtimeDataAvailable = hasRuntimeData(team);
  const missionCoverage = analysisCoverage;
  const sets = coverageSets(list, team);
  return {
    missionCoverage: { ratio: missionCoverage, coveredWeight: missionCoverage === null ? null : Number((staffedCoverage.requiredWeight * missionCoverage).toFixed(3)), requiredWeight: staffedCoverage.requiredWeight },
    staffedCoverage,
    runtimeToolCoverage: { ...runtimeToolCoverage, ratio: runtimeDataAvailable ? runtimeToolCoverage.ratio : null, available: runtimeDataAvailable },
    verifiedCoverage,
    ratio: staffedCoverage.ratio ?? 0,
    coveredSum: staffedCoverage.coveredWeight,
    requiredSum: staffedCoverage.requiredWeight,
    covered: sets.covered.map((item) => item.capability || item.name),
    uncovered: sets.uncovered.map((item) => item.capability || item.name)
  };
}

module.exports = { measureCapabilityCoverage };
