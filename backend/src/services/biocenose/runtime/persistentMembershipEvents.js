'use strict';

const communityStore = require('../communityStore');

async function persistMembershipDecisions(context, session, report) {
  for (const item of report.members) {
    await communityStore.appendEvent(context.db, { communityId: session.communityId,
      actorId: context.actorId, type: 'MEMBERSHIP_DECISION_RECORDED',
      payload: { memberId: item.memberId, domain: item.domain, sampleCount: item.sampleCount,
        reputation: item.reputation, decayedReputation: item.decayedReputation,
        periodsElapsed: item.periodsElapsed, decision: item.decision, reason: item.reason,
        missionIndex: item.missionIndex }, patch: {} });
  }
  const rotated = new Set(report.rotation.rotate.map((item) => item.memberId));
  const expelled = new Set(report.excludedMemberIds.filter((memberId) => !rotated.has(memberId)));
  for (const [memberIds, type, reason] of [[rotated, 'MEMBER_ROTATED', 'ANTI_ENTRENCHMENT'],
    [expelled, 'MEMBER_EXPELLED', 'REPUTATION_BELOW_FLOOR']]) {
    for (const memberId of memberIds) {
      await communityStore.appendEvent(context.db, { communityId: session.communityId,
        actorId: context.actorId, type, payload: { memberId, reason }, patch: {} });
    }
  }
}

module.exports = { persistMembershipDecisions };
