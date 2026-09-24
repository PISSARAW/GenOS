'use strict';

const { createProblemMorphologyProfile } = require('./problemMorphologyProfiler');

function profileScope(input = {}) {
  if (!input.scopeId) throw new Error('scopeId is required');
  const profile = createProblemMorphologyProfile(input.dimensions || {}, {
    scopeId: input.scopeId,
    source: input.source || 'scope_observation',
    observedAt: input.observedAt
  });
  return {
    scopeId: input.scopeId,
    parentScopeId: input.parentScopeId || null,
    profile,
    evidenceRefs: Array.isArray(input.evidenceRefs) ? [...input.evidenceRefs] : [],
    observedAt: profile.observedAt
  };
}

module.exports = { profileScope };
