'use strict';

const { RESOURCE_KEYS } = require('../constants');

function advance(state, input) {
  const providers = providerList(input);
  const demand = vector(input.demand);
  const feasible = rankProviders(providers, demand, input);
  const selected = feasible[0] || null;
  const allocations = [...(state.computeAllocations || [])];
  const previous = allocations.at(-1);
  const migration = shouldMigrate(selected, previous, input.minimumImprovement);
  const result = { selected, candidates: feasible, migration, reason: selected ? 'lowest_feasible_cost' : 'no_feasible_provider' };
  if (selected) allocations.push({ provider: selected.id, location: selected.location, score: selected.score, demand });
  return { state: { ...state, computeAllocations: allocations.slice(-100) }, decision: result,
    action: { type: selected ? (migration ? 'COMPUTE_LOCALITY_MIGRATION' : 'COMPUTE_PROVIDER_SELECTED') : 'COMPUTE_CAPACITY_INSUFFICIENT',
      status: 'applied', provider: selected?.id || null } };
}

function providerList(input) { return Array.isArray(input.providers) ? input.providers.slice(0, 100) : []; }
function rankProviders(providers, demand, input) {
  return providers.map((provider) => scoreProvider({ provider, demand, input }))
    .filter((provider) => provider.feasible).sort((a, b) => a.score - b.score || a.id.localeCompare(b.id));
}
function shouldMigrate(selected, previous, improvement) {
  return Boolean(selected && previous && previous.provider !== selected.id
    && selected.score < previous.score * (1 - clamp(improvement, 0.15)));
}

function scoreProvider(options) {
  const { provider, demand, input } = options;
  const { currentLocation, latencyBudgetMs } = input;
  const available = vector(provider.resources);
  const latency = metric(provider.latencyMs);
  const latencyAllowed = !Number.isFinite(latencyBudgetMs) || latency <= latencyBudgetMs;
  const feasible = latencyAllowed && hasResources(available, demand);
  const cost = metric(provider.costUsd) + metric(provider.energy) * metric(provider.energyPrice);
  const latencyCost = latency / 1000;
  const locationPenalty = currentLocation && provider.location !== currentLocation ? metric(provider.migrationCost) : 0;
  const quotaPenalty = metric(provider.apiQuota) <= 0 && metric(demand.apiQuota) > 0 ? Number.MAX_SAFE_INTEGER : 0;
  return { id: String(provider.id || provider.provider || 'unknown'), location: provider.location || 'unspecified',
    feasible, score: cost + latencyCost + locationPenalty + quotaPenalty, available };
}

function hasResources(available, demand) { return RESOURCE_KEYS.every((key) => available[key] >= demand[key]); }

function vector(value = {}) { return Object.fromEntries(RESOURCE_KEYS.map((key) => [key, metric(value[key])])); }
function metric(value) { return Number.isFinite(value) ? Math.max(0, value) : 0; }
function clamp(value, fallback) { return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : fallback; }

module.exports = { advance };
