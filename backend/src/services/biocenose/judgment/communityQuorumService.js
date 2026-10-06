'use strict';

function evaluate(input) {
  const participants = input.members.filter((member) => member.status === 'ACTIVE'
    && member.role !== 'community_facilitator');
  const ids = new Set(participants.map((member) => member.memberId));
  const byMember = new Map(input.judgments.filter((item) => ids.has(item.memberId)).map((item) => [item.memberId, item.judgment]));
  const positions = new Map();
  let abstentions = 0;
  for (const judgment of byMember.values()) {
    const position = String(judgment.position).trim();
    if (isAbstention(position)) { abstentions += 1; continue; }
    positions.set(position, (positions.get(position) || 0) + 1);
  }
  const activeVotes = byMember.size - abstentions;
  const distribution = [...positions].map(([position, count]) => ({ position, count,
    share: activeVotes ? count / activeVotes : 0 }));
  const participation = participants.length ? byMember.size / participants.length : 0;
  const support = Math.max(0, ...distribution.map((item) => item.share));
  const rule = input.constitution.quorumPolicy;
  return { participantCount: participants.length, participatingMembers: byMember.size, abstentions,
    activeVotes, participation, distribution, support,
    reached: activeVotes > 0 && participation >= rule.minimumParticipationRatio && support >= rule.supportThreshold };
}

function isAbstention(value) {
  return /^(?:ABSTAIN|ABSTENTION|UNKNOWN|UNRESOLVED)$/i.test(value) || !value;
}

module.exports = { evaluate };
