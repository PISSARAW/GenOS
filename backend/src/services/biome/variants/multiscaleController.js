'use strict';

function advance(ecology, state, input) {
  const communities = buildCommunities(ecology, input.memberships);
  const scales = {
    individual: { count: ecology.populations.reduce((sum, population) => sum + population.individuals.length, 0), policy: policy(input, 'individual', 'local_adaptation') },
    population: { count: ecology.populations.length, policy: policy(input, 'population', 'resource_homeostasis') },
    community: { count: Object.keys(communities).length, policy: policy(input, 'community', 'niche_coordination'), communities },
    environment: { nicheCount: ecology.niches.length, resources: ecology.resourcePool, policy: policy(input, 'environment', 'carrying_capacity') }
  };
  const feedback = { upward: upwardFeedback(ecology), downward: downwardFeedback(ecology, input.environmentConstraints) };
  const previous = state.scaleState || {};
  const emergence = detectEmergence(previous, scales);
  return { state: { ...state, scaleState: scales, scaleHistory: [...(state.scaleHistory || []), scales].slice(-100) },
    decision: { scales, feedback, emergence },
    action: { type: emergence.length ? 'CROSS_SCALE_EMERGENCE_DETECTED' : 'CROSS_SCALE_FEEDBACK_APPLIED', status: 'applied' } };
}

function buildCommunities(ecology, memberships) {
  const result = {};
  for (const population of ecology.populations) {
    const communityId = memberships?.[population.populationId] || population.nicheId;
    result[communityId] = [...(result[communityId] || []), population.populationId];
  }
  return result;
}

function upwardFeedback(ecology) {
  return ecology.populations.map((population) => ({ populationId: population.populationId, nicheId: population.nicheId,
    productivity: population.productivity, diversity: population.diversity, health: population.health }));
}

function downwardFeedback(ecology, constraints) {
  const blocked = (Array.isArray(constraints) ? constraints : []).filter((item) => ['blocked', 'exceeded', 'violated'].includes(item.status)
    && Number.isFinite(item.maximum) && require('../constants').RESOURCE_KEYS.includes(item.resource));
  const capped = blocked.map((item) => capResource(ecology, item.resource, item.maximum));
  ecology.ecologicalState.resourceCaps = { ...(ecology.ecologicalState.resourceCaps || {}),
    ...Object.fromEntries(blocked.map((item) => [item.resource, item.maximum])) };
  return { blockedResources: blocked.map((item) => item.resource), affectedPopulations: [...new Set(capped.flat())], policyChanges: capped.length };
}

function capResource(ecology, resource, maximum) {
  const holders = [ecology.resourcePool, ...ecology.populations.map(p => p.resourcePool)];
  const available = holders.reduce((sum, vector) => sum + (vector[resource] || 0), 0);
  const limit = Math.max(0, maximum);
  if (available <= limit) return [];
  const ratio = available > 0 ? limit / available : 0;
  for (const vector of holders) vector[resource] = (vector[resource] || 0) * ratio;
  const quarantine = ecology.ecologicalState.resourceQuarantine || {};
  ecology.ecologicalState.resourceQuarantine = { ...quarantine, [resource]: (quarantine[resource] || 0) + available - limit };
  return ecology.populations.map(p => p.populationId);
}

function enforceCaps(ecology) {
  const caps = ecology.ecologicalState.resourceCaps || {};
  for (const [resource, maximum] of Object.entries(caps)) capResource(ecology, resource, maximum);
}

function policy(input, level, fallback) {
  const allowed = { individual: ['local_adaptation', 'vitrification', 'mutate'], population: ['resource_homeostasis', 'selection', 'migration'],
    community: ['niche_coordination', 'mutualism', 'competition'], environment: ['carrying_capacity', 'constraint_enforcement', 'niche_creation'] };
  return allowed[level].includes(input.policies?.[level]) ? input.policies[level] : fallback;
}

function detectEmergence(previous, current) {
  const oldCommunities = previous.community?.count || 0;
  return current.community.count > oldCommunities ? [{ type: 'COMMUNITY_FORMED', count: current.community.count }] : [];
}

module.exports = { advance, enforceCaps };
