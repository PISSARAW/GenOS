'use strict';

const { requiredId, nonNegative } = require('./contractHelpers');

function createEnvironment(input = {}) {
  return {
    environmentId: requiredId(input.environmentId, 'environmentId'),
    version: Math.max(1, Math.floor(nonNegative(input.version, 'version', 1))),
    boundaries: objectOrEmpty(input.boundaries),
    resources: objectOrEmpty(input.resources),
    constraints: listOrEmpty(input.constraints),
    observableSignals: listOrEmpty(input.observableSignals),
    artifacts: listOrEmpty(input.artifacts),
    tools: listOrEmpty(input.tools),
    repositories: listOrEmpty(input.repositories),
    sources: listOrEmpty(input.sources),
    risks: listOrEmpty(input.risks),
    unresolvedProblems: listOrEmpty(input.unresolvedProblems),
    opportunities: listOrEmpty(input.opportunities),
    currentPhase: input.currentPhase || 'exploration'
  };
}

function objectOrEmpty(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function listOrEmpty(value) {
  return Array.isArray(value) ? value : [];
}

module.exports = { createEnvironment };
