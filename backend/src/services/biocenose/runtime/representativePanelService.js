'use strict';

function prepare(context, session, options) {
  if (!context.variantPolicy?.requireSamplingWeights || options.representativePanel) return options;
  const sampling = context.constitution.representativeSampling;
  if (!sampling) return options;
  const participants = session.members.filter((member) => member.status === 'ACTIVE'
    && member.role !== 'community_facilitator');
  const panel = participants.map((member) => ({ memberId: member.memberId,
    weight: sampling.weights[member.memberId], stratum: member.representativeStratum,
    communityId: session.communityId, status: 'VERIFIED', basis: 'sealed_stratified_sample' }));
  return { ...options, representativePanel: panel, isTrustedReceipt: (seat) => {
    if (panel.includes(seat)) return seat.weight > 0 && sampling.sample.some((item) => item.memberId === seat.memberId);
    return context.isTrustedReceipt?.(seat) === true;
  } };
}

module.exports = { prepare };
