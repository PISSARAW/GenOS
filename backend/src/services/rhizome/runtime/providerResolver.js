'use strict';

function matchesProvider(provider, ctx) {
  return ctx.trustedIds.has(provider.providerId)
    && provider.growthActions.includes(ctx.candidate.action)
    && provider.capabilities.includes(ctx.need.capability)
    && typeof provider.instantiate === 'function';
}

function create(providers = [], trustedProviderIds = []) {
  const trusted = new Set(trustedProviderIds);
  return async function resolve(input) {
    const provider = [...providers]
      .filter((item) => matchesProvider(item, {
        candidate: input.candidate, need: input.need, trustedIds: trusted
      }))
      .sort((left, right) => left.providerId.localeCompare(right.providerId))[0];
    if (!provider) return null;
    const result = await provider.instantiate(input);
    if (!result || !result.node || !Array.isArray(result.edges || [])) return null;
    return {
      provider,
      node: {
        ...result.node,
        providers: [{ providerId: provider.providerId, kind: provider.kind, reference: provider.reference || null }]
      },
      edges: result.edges || []
    };
  };
}

module.exports = { create };
