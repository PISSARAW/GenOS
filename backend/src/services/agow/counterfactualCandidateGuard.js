'use strict';

const simulations = new Map();

function isCounterfactual(candidate) {
  return candidate?.epistemicOrigin?.realityMode === 'counterfactual';
}

function simulationAgentId(simulationId, realAgentId) {
  return `cf:${simulationId}:${realAgentId}`;
}

function registerSimulation(options) {
  if (!options?.simulationId || !options.realAgentId || !options.parentRealityFrameId) {
    throw new TypeError('Counterfactual simulation requires an id, real agent and parent frame.');
  }
  const entry = { realAgentId: options.realAgentId, parentRealityFrameId: options.parentRealityFrameId,
    simulationAgentId: simulationAgentId(options.simulationId, options.realAgentId) };
  simulations.set(options.simulationId, entry);
  return { ...entry, simulationId: options.simulationId };
}

function releaseSimulation(simulationId) {
  return simulations.delete(simulationId);
}

function isolatedWrite(candidate, frame) {
  const origin = candidate?.epistemicOrigin;
  const registered = simulations.get(origin?.simulationId);
  return Boolean(registered && frame?.realityMode === 'counterfactual'
    && frame.simulationId === origin.simulationId
    && candidate.agentId === registered.simulationAgentId
    && frame.agentId === registered.simulationAgentId
    && origin.parentRealityFrameId === registered.parentRealityFrameId);
}

function mayWriteCanonicalWorld(candidate, frame) {
  return !isCounterfactual(candidate) || isolatedWrite(candidate, frame);
}

function rejectReason(candidate, frame) {
  return !mayWriteCanonicalWorld(candidate, frame) ? 'counterfactual_write_isolated' : null;
}

module.exports = { isCounterfactual, simulationAgentId, registerSimulation, releaseSimulation,
  mayWriteCanonicalWorld, rejectReason };
