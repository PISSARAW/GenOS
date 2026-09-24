'use strict';

const { assessCompatibility } = require('./nicheCompatibilityService');
const { createIndividual } = require('../contracts/individual');

function assessIndividual(individual = {}, niches = []) {
  const capabilities = resolveCapabilities(individual);
  const assessments = (Array.isArray(niches) ? niches : []).map((niche) => assessNiche(niche, capabilities));
  const fundamental = assessments.filter((assessment) => assessment.fit.compatible);
  const realized = assessments.filter(isAvailable).sort(compareOpportunity)[0] || null;
  return {
    individualId: String(individual.individualId || ''),
    capabilities,
    fundamentalNicheIds: fundamental.map((assessment) => assessment.nicheId),
    realizedNicheId: realized ? realized.nicheId : null,
    assessment: {
      consideredNicheIds: assessments.map((assessment) => assessment.nicheId),
      realizedFit: realized ? realized.fit.fit : null,
      reason: realized ? 'best_available_fit' : 'no_available_compatible_niche'
    }
  };
}

function assessAndStore(ecology, individuals) {
  const assessed = (Array.isArray(individuals) ? individuals : []).map((input) => {
    const individual = createIndividual(input);
    const result = assessIndividual(individual, ecology.niches);
    return createIndividual({ ...individual, ...result, nicheAssessment: result.assessment });
  });
  const stored = new Map((ecology.ecologicalState.individuals || []).map((item) => [item.individualId, item]));
  for (const individual of assessed) stored.set(individual.individualId, individual);
  ecology.ecologicalState.individuals = [...stored.values()];
  return assessed;
}

function resolveCapabilities(individual) {
  const phenotype = individual.phenotype || {};
  const genome = individual.genome || {};
  const values = [individual.capabilities, phenotype.capabilities, phenotype.skills, genome.capabilities];
  return [...new Set(values.flatMap(asList).map((value) => String(value).trim()).filter(Boolean))].sort();
}

function assessNiche(niche, capabilities) {
  return {
    nicheId: niche.nicheId,
    status: niche.status,
    opportunityScore: Number(niche.opportunityScore) || 0,
    occupancy: Number(niche.occupancy) || 0,
    carryingCapacity: Number(niche.carryingCapacity) || 0,
    fit: assessCompatibility({ requiredCapabilities: niche.requiredCapabilities, capabilities })
  };
}

function isAvailable(assessment) {
  const active = ['open', 'colonized'].includes(assessment.status);
  const hasCapacity = assessment.carryingCapacity === 0 || assessment.occupancy < assessment.carryingCapacity;
  return active && hasCapacity && assessment.fit.compatible;
}

function compareOpportunity(left, right) {
  return right.opportunityScore - left.opportunityScore || left.nicheId.localeCompare(right.nicheId);
}

function asList(value) {
  if (Array.isArray(value)) return value;
  return typeof value === 'string' ? [value] : [];
}

module.exports = { assessIndividual, assessAndStore };
