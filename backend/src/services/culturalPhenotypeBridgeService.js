'use strict';

const { measureCulturalTransfer } = require('./culturalTransmissionService');
const { developFromEnvironment } = require('./phenotypicDevelopmentService');
const { phenotypeVector } = require('./phenotypeVectorService');

async function transferCultureToPhenotype(options) {
  const state = options?.phenotypeState;
  const previous = state && structuredClone(state);
  try {
    return await performTransfer(options);
  } catch (error) {
    if (previous) {
      for (const key of Object.keys(state)) delete state[key];
      Object.assign(state, previous);
    }
    throw error;
  }
}

async function performTransfer(options) {
  const input = options || {};
  const state = input.phenotypeState;
  const artifact = input.artifact;
  if (!state || !artifact) throw new Error('A phenotype state and cultural artifact are required.');
  validateArtifact(artifact, state, input);
  const beforeVector = phenotypeVector(state.currentPhenotype, state);
  const transfer = typeof input.benchmark === 'function'
    ? await measureCulturalTransfer({
      benchmarkBefore: input.benchmark,
      integrateArtifact: async () => integrateArtifactIntoPhenotype(state, artifact),
      benchmarkAfter: input.benchmark,
    })
    : { integration: integrateArtifactIntoPhenotype(state, artifact),
      measured: false, before: null, after: null, delta: null };
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

function validateArtifact(artifact, state, input) {
  if (!hasArtifactIdentity(artifact)) {
    throw new Error('An active cultural artifact with an author and content is required.');
  }
  if (!hasValidProvenance(artifact)) {
    throw new Error('Cultural artifact provenance does not match its author.');
  }
  if (input.recipientAgentId && state.agentId && state.agentId !== input.recipientAgentId) {
    throw new Error('Cultural artifact recipient does not own the phenotype.');
  }
}

function hasArtifactIdentity(artifact) {
  return typeof artifact.id === 'string' && Boolean(artifact.id.trim())
    && typeof artifact.agentId === 'string' && Boolean(artifact.agentId.trim())
    && artifact.active !== false && Boolean(artifact.content)
    && typeof artifact.content === 'object';
}

function hasValidProvenance(artifact) {
  return artifact.provenance?.createdBy === artifact.agentId
    || Boolean(artifact.provenance?.mutatedFrom);
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
  return JSON.stringify(before) !== JSON.stringify(after);
}

module.exports = { transferCultureToPhenotype };
