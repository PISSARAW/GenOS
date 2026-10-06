'use strict';
const diversity = require('./trinityDiversityPlanner');
const differentiation = require('./trinityDifferentiationService');
function provenance(events) {
  const event = [...events].reverse().find(item => item.eventType === 'AGENT_COMPLETED' && item.payload?.model && item.payload?.provider);
  if (!event) return null;
  return { model: event.payload.model, provider: event.payload.provider, eventId: event.eventId || event.id,
    source: 'runtime_completion_event' };
}
function evaluate(worlds, selection) {
  const observations = (worlds || []).map(world => {
    const route = world.runtimeProvenance;
    if (route?.source !== 'runtime_completion_event') return null;
    return { provider: route.provider, modelFamily: differentiation.familyOf(route.model),
      cognitiveRecipe: selection.diversity?.worlds?.[(world.worldNumber - 1) % 3]?.cognitiveRecipe,
      tools: [], lineage: world.agentId, agentId: world.agentId };
  });
  if (observations.length < 3 || observations.some(item => !item)) return { valid: false, reason: 'effective_model_provenance_missing' };
  const policy = selection.experimentalDesign?.diversityPolicy;
  if (policy === 'provider_diverse') return { ...diversity.enforceProviderDiversity(observations), reason: 'effective_provider_diversity_below_threshold' };
  const result = diversity.validateDiversity(observations.slice(0, 3));
  return { ...result, reason: 'effective_model_diversity_below_threshold', method: 'runtime_observed_routes' };
}
module.exports = { provenance, evaluate };
