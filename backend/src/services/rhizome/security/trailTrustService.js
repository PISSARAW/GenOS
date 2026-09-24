'use strict';

function contribution(input) {
  const identity = identify(input.identityContext);
  const trusted = new Set(input.trustedDigests || []);
  if (!trusted.has(identity.digest)) return { amount: 0, supporters: input.current?.supporters || [], trustWeight: 0 };
  return applySupport(input, identity);
}

function identify(context) {
  const identity = {
    digest: text(context?.identityDigest),
    provider: text(context?.providerId),
    lineage: text(context?.lineageId),
    independence: text(context?.epistemicGroup)
  };
  if (!identity.digest || !identity.provider && !identity.lineage && !identity.independence) {
    throw Object.assign(new Error('Stigmergic contribution requires a verified identity and independence group.'), { code: 'RHIZOME_TRAIL_IDENTITY_REQUIRED' });
  }
  identity.group = identity.independence || identity.lineage || identity.provider;
  return identity;
}

function applySupport(input, identity) {
  const sign = input.isRepellent ? 'negative' : 'positive';
  const supporterId = `${sign}:${identity.group}`;
  const supporters = [...(input.current?.supporters || [])];
  const prior = supporters.find((item) => item.supporterId === supporterId);
  const strength = contributionStrength(input.amount, input.confidence);
  const increment = Math.max(0, strength - (prior?.creditedAmount || 0));
  const supporter = { supporterId, providerId: identity.provider, lineageId: identity.lineage, creditedAmount: Math.max(prior?.creditedAmount || 0, strength) };
  const next = prior ? supporters.map((item) => item.supporterId === supporterId ? supporter : item) : [...supporters, supporter];
  return { amount: increment, supporters: next, trustWeight: 1 };
}

function contributionStrength(amount, confidence) {
  const confidenceValue = confidence === undefined ? 0.5 : Number(confidence);
  const safeConfidence = Number.isFinite(confidenceValue) ? confidenceValue : 0;
  return Math.min(100, Math.max(0, Number(amount) || 0)) * Math.min(1, Math.max(0, safeConfidence));
}

function text(value) {
  return typeof value === 'string' && value.trim().length ? value.trim() : null;
}

module.exports = { contribution };
