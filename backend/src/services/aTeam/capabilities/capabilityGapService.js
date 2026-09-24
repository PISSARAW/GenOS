'use strict';

function memberCapabilities(members) {
  return new Set((Array.isArray(members) ? members : []).flatMap((member) => [
    ...(Array.isArray(member.capabilities) ? member.capabilities : []),
    ...(Array.isArray(member.expertise) ? member.expertise : []),
    member.domain
  ]).filter(Boolean).map((value) => String(value).toLowerCase()));
}

function findCapabilityGaps(requirements, members) {
  const available = memberCapabilities(members);
  return (Array.isArray(requirements) ? requirements : [])
    .filter((requirement) => !available.has(String(requirement.capability || requirement.name).toLowerCase()))
    .map((requirement) => ({
      capability: requirement.capability || requirement.name,
      weight: Number(requirement.weight) || 1,
      criticality: requirement.criticality || 'normal',
      evidenceRequired: requirement.evidenceRequired !== false,
      reason: 'UNSTAFFED_CAPABILITY'
    }));
}

module.exports = { findCapabilityGaps };
