'use strict';

const CONTRACT_VERSION = '1.1.0';
const EXECUTION_KINDS = Object.freeze([
  'canonical_service', 'hybrid_adapter', 'simulation_adapter'
]);
const CAPABILITY_STATES = Object.freeze([
  'verified', 'declared', 'unknown', 'unsupported'
]);
const MORPHOGENESIS_CAPABILITIES = Object.freeze([
  'observe', 'adapt', 'quiesce', 'snapshot', 'restore', 'finalize'
]);

function createTopologyRuntimePort(input = {}) {
  validateDefinition(input);
  const lifecycle = normalizeLifecycle(input.lifecycle);
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
    qualified: (capability) => qualified(descriptor, lifecycle, capability),
    morphogenesis: (capability, request) => invokeMorphogenesis({
      capability, descriptor, lifecycle, request
    }),
    run: (args, context) => runPort({ execute: input.execute, descriptor, args, context })
  });
}

async function invokeMorphogenesis(input) {
  const { capability, descriptor, lifecycle, request = {} } = input;
  assertCapability(capability);
  if (!qualified(descriptor, lifecycle, capability)) {
    throw coded('TOPOLOGY_MORPHOGENESIS_CAPABILITY_UNQUALIFIED',
      `${descriptor.topology}.${capability} is not a verified runtime capability.`);
  }
  return lifecycle[capability]({
    ...objectValue(request), port: structuredClone(descriptor)
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
  assertCapability(capability);
  const state = descriptor.morphogenesis[capability];
  return state === 'verified' || state === 'declared';
}

function qualified(descriptor, lifecycle, capability) {
  assertCapability(capability);
  return descriptor.morphogenesis[capability] === 'verified'
    && typeof lifecycle[capability] === 'function';
}

function normalizeMorphogenesis(input = {}) {
  const result = {};
  for (const capability of MORPHOGENESIS_CAPABILITIES) {
    const state = input[capability] || 'unknown';
    if (!CAPABILITY_STATES.includes(state)) {
      throw new Error(`Unknown morphogenesis capability state: ${state}`);
    }
    result[capability] = state;
  }
  return Object.freeze(result);
}

function normalizeLifecycle(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('TopologyRuntimePort lifecycle must be an object.');
  }
  for (const capability of Reflect.ownKeys(input)) {
    assertCapability(capability);
    if (typeof input[capability] !== 'function') {
      throw new Error(`TopologyRuntimePort lifecycle ${capability} must be a function.`);
    }
  }
  return Object.freeze({ ...input });
}

function assertCapability(capability) {
  if (!MORPHOGENESIS_CAPABILITIES.includes(capability)) {
    throw coded('TOPOLOGY_MORPHOGENESIS_CAPABILITY_UNKNOWN',
      `Unknown morphogenesis capability: ${String(capability)}`);
  }
}

function coded(code, message) {
  return Object.assign(new Error(message), { code });
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
  CAPABILITY_STATES, CONTRACT_VERSION, EXECUTION_KINDS, MORPHOGENESIS_CAPABILITIES,
  createTopologyRuntimePort
};
