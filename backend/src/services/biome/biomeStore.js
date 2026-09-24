'use strict';

const { createBiomeSession } = require('./contracts/biomeSession');
const { createEnvironment } = require('./contracts/environment');
const { createNiche } = require('./contracts/niche');
const populationService = require('./populations/populationService');
const { createResourceVector } = require('./contracts/resourceVector');
const { createEcologicalLink } = require('./contracts/ecologicalLink');
const { evaluateConstraints } = require('./environment/environmentalConstraintService');
const { buildOpportunityMap } = require('./environment/opportunityMapService');

function createBiomeState(input = {}) {
  const id = String(input.biomeId || '').trim();
  const environment = createEnvironment(input.environment || { environmentId: `${id}:environment` });
  return createBiomeSession({
    ...input,
    environment,
    environmentConstraints: evaluateConstraints(environment).evaluations,
    opportunityMap: buildOpportunityMap(environment),
    niches: (input.niches || []).map(createNiche),
    populations: (input.populations || []).map(populationService.normalizePopulation),
    resourcePool: createResourceVector(input.resourcePool),
    interactionGraph: (input.interactionGraph || []).map(createEcologicalLink)
  });
}

module.exports = { createBiomeState };
