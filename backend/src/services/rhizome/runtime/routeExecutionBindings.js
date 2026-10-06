'use strict';

const rhizome = require('../../rhizomeCoordinationService');

function create(input) {
  const context = { providers: input.providers, verifiers: input.verifiers || [],
    trustedProviders: new Set(input.trustedProviderIds || []), trustedVerifiers: new Set(input.trustedVerifierDigests || []) };
  return { execute: request => execute(context, request), verify: request => verify(context, request) };
}

function executable(provider, context) {
  return context.ids.has(provider.providerId) && context.trusted.has(provider.providerId)
    && provider.capabilities.includes(context.need.capability) && typeof provider.execute === 'function';
}

async function execute(bindings, context) {
  const graph = await rhizome.graphSnapshot(context.sessionId, context.options);
  const node = graph.nodes.find(item => item.nodeId === context.route.nodeIds.at(-1));
  const ids = new Set((node?.providers || []).map(provider => provider.providerId));
  const provider = bindings.providers.find(item => executable(item, { ids, trusted: bindings.trustedProviders, need: context.need }));
  if (!provider) throw Object.assign(new Error('No trusted executable provider for the selected route.'), { code: 'RHIZOME_ROUTE_PROVIDER_UNAVAILABLE' });
  return provider.execute({ ...context, instanceId: node.localContext?.instanceId });
}

async function verify(bindings, context) {
  const verifier = bindings.verifiers.find(item => bindings.trustedVerifiers.has(item.verifierDigest)
    && item.capabilities.includes(context.need.capability) && typeof item.verifyRoute === 'function');
  return verifier ? verifier.verifyRoute(context) : null;
}

module.exports = { create };
