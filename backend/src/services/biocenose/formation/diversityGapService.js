'use strict';

function diversityGaps(selected, requested) {
  const members = Array.isArray(selected) ? selected : [];
  const expected = requested || {};
  const roles = ['generator', 'reviewer', 'verifier'];
  const missingRoles = roles.filter((role) => members.filter((member) => member.role === role).length < (expected[role] || 0));
  return {
    missingRoles,
    providerCount: uniqueCount(members.map((member) => member.provider)),
    strategyCount: uniqueCount(members.flatMap((member) => member.strategy || [])),
    toolCount: uniqueCount(members.flatMap((member) => member.tools || [])),
    expertiseCount: uniqueCount(members.flatMap((member) => member.expertise || []))
  };
}

function uniqueCount(values) {
  return new Set(values.filter(Boolean)).size;
}

module.exports = { diversityGaps };
