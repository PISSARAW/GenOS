'use strict';

const { mapMissionEnvironment } = require('./environmentMapper');
const { evaluateConstraints } = require('./environmentalConstraintService');
const { buildOpportunityMap } = require('./opportunityMapService');
const { versionEnvironment } = require('./environmentVersioning');

function createEnvironmentModel(input = {}) {
  const environment = mapMissionEnvironment(input);
  return {
    environment,
    constraints: evaluateConstraints(environment),
    opportunities: buildOpportunityMap(environment)
  };
}

function applyEnvironmentUpdate(input = {}) {
  const versioned = versionEnvironment(input);
  return {
    ...versioned,
    constraints: evaluateConstraints(versioned.environment),
    opportunities: buildOpportunityMap(versioned.environment)
  };
}

module.exports = { createEnvironmentModel, applyEnvironmentUpdate };
