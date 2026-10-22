'use strict';

const { errorAmplification } = require('../epidemiology/errorAmplificationService');

function registerError(error, errorRegistry) {
  const entry = {
    errorId: error && error.errorId ? String(error.errorId) : `err-${Date.now()}`,
    timestamp: Date.now(),
    ...(error || {})
  };
  errorRegistry.push(entry);
  return entry;
}

function recordTransmission(transmission, state) {
  const key = `${transmission.sourceNodeId}->${transmission.targetNodeId}`;
  let edges = state.transmissionGraph.get(key);
  if (!edges) {
    edges = [];
    state.transmissionGraph.set(key, edges);
  }
  edges.push({ errorId: transmission.errorId, timestamp: Date.now() });
  return edges;
}

function neighborsOf(nodeId, transmissionGraph) {
  const result = [];
  for (const [key, edges] of transmissionGraph) {
    const [source, target] = key.split('->');
    if (source === nodeId) {
      for (const edge of edges) result.push({ target, errorId: edge.errorId });
    }
  }
  return result;
}

function seedSources(errorId, transmissionGraph) {
  const sources = new Set();
  const targets = new Set();
  for (const [key, edges] of transmissionGraph) {
    if (edges.some((edge) => edge.errorId === errorId)) {
      const [source, target] = key.split('->');
      sources.add(source);
      targets.add(target);
    }
  }
  const roots = new Set([...sources].filter((s) => !targets.has(s)));
  return roots.size > 0 ? roots : sources;
}

function assessPropagation(errorId, transmissionGraph) {
  const primarySources = seedSources(errorId, transmissionGraph);
  const visited = new Set(primarySources);
  const queue = [...primarySources];
  const secondary = new Set();
  while (queue.length > 0) {
    const node = queue.shift();
    for (const neighbor of neighborsOf(node, transmissionGraph)) {
      if (neighbor.errorId === errorId || !neighbor.errorId) {
        secondary.add(neighbor.target);
        if (!visited.has(neighbor.target)) {
          visited.add(neighbor.target);
          queue.push(neighbor.target);
        }
      }
    }
  }
  const reachable = visited.size;
  const amp = errorAmplification(primarySources.size, secondary.size);
  return {
    errorId,
    reachableNodes: reachable,
    secondaryNodes: secondary.size,
    R_error: amp.ratio,
    risk: secondary.size > 0 ? 'propagating' : 'contained'
  };
}

function contain(errorId, policy, containmentPolicy) {
  const active = policy || containmentPolicy;
  const action = active && active.defaultAction ? active.defaultAction : 'isolate';
  return { errorId, action, enforcedAt: Date.now() };
}

function createErrorEpidemiologist(input = {}) {
  const errorRegistry = input.errorRegistry || [];
  const transmissionGraph = input.transmissionGraph || new Map();
  const containmentPolicy = input.containmentPolicy || { defaultAction: 'isolate' };
  const state = { errorRegistry, transmissionGraph, containmentPolicy };
  return {
    errorRegistry,
    transmissionGraph,
    containmentPolicy,
    registerError: (error) => registerError(error, state.errorRegistry),
    recordTransmission: (transmission) => recordTransmission(transmission, state),
    neighborsOf: (nodeId) => neighborsOf(nodeId, state.transmissionGraph),
    assessPropagation: (errorId) => assessPropagation(errorId, state.transmissionGraph),
    contain: (errorId, policy) => contain(errorId, policy, state.containmentPolicy)
  };
}

module.exports = { createErrorEpidemiologist };
