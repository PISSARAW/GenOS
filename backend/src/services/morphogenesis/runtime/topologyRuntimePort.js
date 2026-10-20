'use strict';

const CONTRACT_VERSION = '1.0.0';
const EXECUTION_KINDS = Object.freeze([
  'canonical_service', 'hybrid_adapter', 'simulation_adapter'
]);
const CAPABILITY_STATES = Object.freeze([
  'verified', 'declared', 'unknown', 'unsupported'
]);

function createTopologyRuntimePort(input = {}) {
  validateDefinition(input);
  const descriptor = Object.freeze({
    contractVersion: CONTRACT_VERSION,
    topology: input.topology,
    executionKind: input.executionKind,
    morphogenesis: normalizeMorphogenesis(input.morphogenesis)
  });
  return Object.freeze({
    topology: input.topology,
    contractVersion: CONTRACT_VERSION,
    executionKind: input.executionKind,
    describe: () => structuredClone(descriptor),
    supports: (capability) => supports(descriptor, capability),
    run: (args, context) => runPort({ execute: input.execute, descriptor, args, context })
  });
}

async function runPort(input) {
  const { execute, descriptor, args = {}, context = {} } = input;
  const output = await execute({
    args: objectValue(args), context: objectValue(context), port: descriptor
  });
  return attachDescriptor(output, descriptor);
}

function attachDescriptor(output, descriptor) {
  const runtimePort = structuredClone(descriptor);
  if (output && typeof output === 'object' && !Array.isArray(output)) {
    return { ...output, runtimePort };
  }
  return { topologyOutput: output, runtimePort };
}

function supports(descriptor, capability) {
  const state = descriptor.morphogenesis[capability];
  return state === 'verified' || state === 'declared';
}

function normalizeMorphogenesis(input = {}) {
  const result = {};
  for (const capability of ['observe', 'adapt', 'quiesce', 'snapshot', 'restore', 'finalize']) {
    const state = input[capability] || 'unknown';
    if (!CAPABILITY_STATES.includes(state)) {
      throw new Error(`Unknown morphogenesis capability state: ${state}`);
    }
    result[capability] = state;
  }
  return Object.freeze(result);
}

function validateDefinition(input) {
  if (!input.topology) throw new Error('TopologyRuntimePort requires a topology.');
  if (!EXECUTION_KINDS.includes(input.executionKind)) {
    throw new Error(`Unknown TopologyRuntimePort execution kind: ${input.executionKind}`);
  }
  if (typeof input.execute !== 'function') {
    throw new Error('TopologyRuntimePort requires an execute function.');
  }
}

function objectValue(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

module.exports = {
  CAPABILITY_STATES, CONTRACT_VERSION, EXECUTION_KINDS, createTopologyRuntimePort
};
