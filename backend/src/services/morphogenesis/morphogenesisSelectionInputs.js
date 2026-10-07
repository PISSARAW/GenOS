'use strict';

const { selectMinimumMorphology } = require('./synthesis/minimalMorphologyPolicy');
const { classifyMorphologyLabel, isTopology } = require('./morphogenesisOntology');

function selectionInputs(ctx) {
  const labels = classifyMorphologyLabel(ctx.proposedTopology);
  const organization = ctx.proposedOrganization || (labels.kind === 'organization' ? labels.id : null);
  const minimum = Array.isArray(ctx.minimumMorphologyCandidates)
    ? selectMinimumMorphology(ctx.minimumMorphologyCandidates, ctx.morphologyDemand || {}) : null;
  const minimumTopology = simpleMinimumTopology(minimum);
  const requested = ctx.topologyProfile?.baseTopology || minimumTopology
    || (isTopology(ctx.proposedTopology) ? ctx.proposedTopology : null);
  return { organization, minimum, requested };
}

function simpleMinimumTopology(minimum) {
  const minimumTopology = minimum && minimum.valid && minimum.selected.level === 'simple_topology'
    ? minimum.selected.candidate.topology || minimum.selected.candidate.id : null;
  return minimumTopology;
}

module.exports = { selectionInputs };
