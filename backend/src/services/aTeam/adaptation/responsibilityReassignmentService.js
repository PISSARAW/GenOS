'use strict';

function capabilities(member) {
  return new Set([...(member.capabilities || []), ...(member.expertise || [])].map((value) => String(value).toLowerCase()));
}

function eligibleMembers(gap, members, failedId) {
  const capability = String(gap.capability || gap.name || '').toLowerCase();
  return (Array.isArray(members) ? members : []).filter((member) => {
    const identity = member.agentId || member.memberId;
    return identity !== failedId && !['FAILED', 'BLOCKED'].includes(String(member.status || '').toUpperCase()) && capabilities(member).has(capability);
  });
}

function planReassignment(input = {}) {
  const gap = input.gap || {};
  const member = eligibleMembers(gap, input.members, input.failedMemberId)[0];
  if (!member) return { status: 'BLOCKED', reason: 'NO_ELIGIBLE_MEMBER_FOR_REASSIGNMENT' };
  const responsibility = gap.capability || gap.name;
  return { status: 'REASSIGN', capability: responsibility, fromMemberId: input.failedMemberId || null, toMemberId: member.agentId || member.memberId };
}

module.exports = { planReassignment };
