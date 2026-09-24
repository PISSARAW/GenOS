'use strict';

function gapList(aTeam = {}) {
  const explicit = Array.isArray(aTeam.capabilityGaps) ? aTeam.capabilityGaps : [];
  const uncovered = aTeam.capabilityCoverage?.uncovered || [];
  const combined = [...explicit, ...uncovered.map((capability) => ({ capability, reason: 'UNSTAFFED_CAPABILITY' }))];
  const seen = new Set();
  return combined.filter((gap) => {
    const key = String(gap.capability || gap.name || '');
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function failedMembers(members) {
  return (Array.isArray(members) ? members : []).filter((member) => ['FAILED', 'BLOCKED'].includes(String(member.status || '').toUpperCase()));
}

function observeStaffingGaps(aTeam = {}) {
  return { capabilityGaps: gapList(aTeam), failedMembers: failedMembers(aTeam.members) };
}

module.exports = { observeStaffingGaps };
