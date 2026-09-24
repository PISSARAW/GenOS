'use strict';

const communityStore = require('../communityStore');

async function setStatus(input) {
  const memberIds = await communityStore.memberIds(input.db, input.communityId);
  if (!memberIds.includes(input.memberId)) throw Object.assign(new Error('Quarantine target is not a community member.'), { code: 'BIOCENOSE_QUARANTINE_MEMBER_INVALID' });
  const type = input.quarantined ? 'MEMBER_QUARANTINED' : 'MEMBER_REINSTATED';
  await communityStore.appendEvent(input.db, {
    communityId: input.communityId, actorId: input.actorId, type,
    payload: { memberId: input.memberId, reason: input.reason }, patch: {}
  });
  return { memberId: input.memberId, quarantined: input.quarantined };
}

module.exports = { setStatus };
