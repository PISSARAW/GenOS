'use strict';

const PROVIDER_KINDS = Object.freeze(['agent', 'daemon', 'tool', 'service', 'human', 'runtime']);

function create(adapters = {}) {
  return PROVIDER_KINDS.flatMap((kind) => buildProvider(kind, adapters[kind]));
}

function buildProvider(kind, adapter) {
  if (!adapter) return [];
  const instantiate = typeof adapter === 'function' ? adapter : adapter.instantiate;
  if (typeof instantiate !== 'function' || !text(adapter.providerId) || !Array.isArray(adapter.capabilities) || !adapter.capabilities.length) {
    throw Object.assign(new Error(`Rhizome ${kind} adapter requires providerId, capabilities and instantiate.`), { code: 'RHIZOME_PROVIDER_ADAPTER_INVALID' });
  }
  const actions = Array.isArray(adapter.growthActions) ? adapter.growthActions : [];
  if (!actions.length) throw Object.assign(new Error(`Rhizome ${kind} adapter requires growthActions.`), { code: 'RHIZOME_PROVIDER_ACTIONS_REQUIRED' });
  return [{
    providerId: adapter.providerId,
    kind,
    reference: adapter.reference || null,
    capabilities: [...new Set(adapter.capabilities)],
    growthActions: [...new Set(actions)],
    instantiate
  }];
}

function text(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

module.exports = { create, PROVIDER_KINDS };
