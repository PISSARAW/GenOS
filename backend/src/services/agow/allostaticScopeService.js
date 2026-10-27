'use strict';

const SCOPES = Object.freeze({
  agent: 'agow_attention_policy', topology: 'agow_allostasis_topology',
  mission: 'agow_allostasis_mission', organization: 'agow_allostasis_organization'
});

function normalizeLevel(value) {
  const variables = value?.variables;
  const measured = variables && typeof variables === 'object' && !Array.isArray(variables);
  return { status: measured ? 'measured' : 'unavailable', variables: measured ? { ...variables } : null,
    sampledAt: Number.isFinite(value?.measuredAt) ? value.measuredAt : null };
}

async function loadScope(options, scope, storageScope) {
  const override = options.provided?.[scope];
  if (override) return normalizeLevel(override);
  const stored = await require('./agowStatePersistenceService').load({
    scope: storageScope, agentId: options.agentId, db: options.db
  });
  return normalizeLevel(stored.state);
}

async function resolve(options) {
  const entries = await Promise.all(Object.entries(SCOPES).map(async ([scope, storageScope]) =>
    [scope, await loadScope(options, scope, storageScope)]));
  return Object.fromEntries(entries);
}

module.exports = { SCOPES, normalizeLevel, resolve };
