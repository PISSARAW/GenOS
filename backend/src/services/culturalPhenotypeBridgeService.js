'use strict';

const { measureCulturalTransfer } = require('./culturalTransmissionService');
const { developFromEnvironment } = require('./phenotypicDevelopmentService');
const { phenotypeVector } = require('./phenotypeVectorService');

async function transferCultureToPhenotype(options) {
  const input = options || {};
  const state = input.phenotypeState;
  const artifact = input.artifact;
  if (!state || !artifact) throw new Error('A phenotype state and cultural artifact are required.');
  const beforeVector = phenotypeVector(state.currentPhenotype, state);
  const transfer = await measureCulturalTransfer({
    benchmarkBefore: input.benchmark,
    integrateArtifact: async () => integrateArtifactIntoPhenotype(state, artifact),
    benchmarkAfter: input.benchmark,
  });
  const afterVector = phenotypeVector(state.currentPhenotype, state);
  return {
    artifactId: artifact.id,
    transfer,
    phenotype: {
      beforeVector,
      afterVector,
      changed: vectorChanged(beforeVector, afterVector),
      actions: transfer.integration.actions || [],
    },
  };
}

function integrateArtifactIntoPhenotype(state, artifact) {
  const content = artifact.content || {};
  const requiredTools = validRequirements(content.requiredTools);
  const requiredCapabilities = validRequirements(content.requiredCapabilities);
  if (!requiredTools.length && !requiredCapabilities.length) {
    return { artifactId: artifact.id, integrated: false, reason: 'no phenotype requirements in artifact' };
  }
  const historyStart = state.history.length;
  const actions = developFromEnvironment(state, { requiredTools, requiredCapabilities });
  for (const event of state.history.slice(historyStart)) event.culturalArtifactId = artifact.id;
  return { artifactId: artifact.id, integrated: actions.length > 0, actions };
}

function validRequirements(value) {
  return Array.isArray(value) ? value.filter((item) => typeof item === 'string' && item.trim()) : [];
}

function vectorChanged(before, after) {
  return before.values.some((value, index) => value !== after.values[index]);
}

module.exports = { transferCultureToPhenotype };
