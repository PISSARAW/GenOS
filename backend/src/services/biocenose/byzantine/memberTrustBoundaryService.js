'use strict';

function evaluate(memberId, activeMemberIds, events) {
  if (!activeMemberIds.includes(memberId)) return { trusted: false, reason: 'NOT_AN_ACTIVE_MEMBER' };
  const state = (events || []).filter((event) => ['MEMBER_QUARANTINED', 'MEMBER_REINSTATED'].includes(event.type)
    && event.payload.memberId === memberId).at(-1);
  if (state?.type === 'MEMBER_QUARANTINED') return { trusted: false, reason: 'QUARANTINED' };
  return { trusted: true, reason: null };
}

module.exports = { evaluate };
