'use strict';

const candidateAdapter = require('../candidates/candidateAdapterService');

function build(options) {
  const representation = options.representation;
  if (!representation?.probeId || !Array.isArray(representation.activations)
    || !representation.evidenceRefs?.length) throw new TypeError('J-space representation evidence required.');
  return candidateAdapter.build({ module: 'world_model', agentId: options.agentId, now: options.now,
    observation: { candidateId: `jspace:${representation.modelId}:${representation.probeId}`,
      semanticType: 'model_internal_representation_hypothesis',
      compactPreview: `Probe ${representation.probeId}; ${representation.activations.length} activation(s)`,
      confidence: 0.25, evidenceCoverage: 1, evidenceRefs: representation.evidenceRefs,
      epistemicOrigin: { origin: 'model_inferred', realityMode: 'real', agency: 'self' },
      constraints: { integrity: 'review' }, causalParents: [representation.probeId] } });
}

module.exports = { build };
