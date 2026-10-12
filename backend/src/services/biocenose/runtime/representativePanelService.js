'use strict';

function prepare(context, session, options) {
  if (!context.variantPolicy?.requireSamplingWeights) return options;
  const panel = sealedPanel(context.constitution?.representativeSampling, session);
  return { ...options, representativePanel: panel, isTrustedReceipt: (seat) => {
    if (panel.includes(seat)) return true;
    return context.isTrustedReceipt?.(seat) === true;
  } };
}

function sealedPanel(sampling, session) {
  if (!Array.isArray(sampling?.sample) || !sampling.weights) return [];
  const active = new Map(session.members.filter((member) => member.status === 'ACTIVE'
    && member.role !== 'community_facilitator').map((member) => [member.memberId, member]));
  const ids = sampling.sample.map((member) => member.memberId);
  if (!ids.length || new Set(ids).size !== ids.length || ids.some((id) =>
    !active.has(id) || !Number.isFinite(sampling.weights[id]) || sampling.weights[id] <= 0)) return [];
  return ids.map((id) => ({ memberId: id,
    weight: sampling.weights[id], stratum: active.get(id).representativeStratum,
    communityId: session.communityId, status: 'VERIFIED', basis: 'sealed_stratified_sample' }));
}

module.exports = { prepare };
