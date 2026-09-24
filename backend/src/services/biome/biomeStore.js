'use strict';

const { createBiomeSession } = require('./contracts/biomeSession');
const { createEnvironment } = require('./contracts/environment');
const { createNiche } = require('./contracts/niche');
const { createPopulation } = require('./contracts/population');
const { createResourceVector } = require('./contracts/resourceVector');
const { createEcologicalLink } = require('./contracts/ecologicalLink');

function createBiomeState(input = {}) {
  const id = String(input.biomeId || '').trim();
  return createBiomeSession({
    ...input,
    environment: createEnvironment(input.environment || { environmentId: `${id}:environment` }),
    niches: (input.niches || []).map(createNiche),
    populations: (input.populations || []).map(createPopulation),
    resourcePool: createResourceVector(input.resourcePool),
    interactionGraph: (input.interactionGraph || []).map(createEcologicalLink)
  });
}

module.exports = { createBiomeState };
