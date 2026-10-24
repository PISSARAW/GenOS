'use strict';

const { createCapabilityDescriptor } = require('./capabilityDescriptor');

function createExportRegistry({ descriptors = [], capabilityGraph = {}, accessFor = () => null } = {}) {
  const exportsById = new Map();
  for (const input of descriptors) {
    const descriptor = createCapabilityDescriptor(input);
    const key = `${descriptor.capabilityId}@${descriptor.version}`;
    if (exportsById.has(key)) throw new Error(`Duplicate GCI export: ${key}`);
    const concept = capabilityGraph[descriptor.capabilityId]
      || capabilityGraph[`capability:${descriptor.capabilityId}`];
    if (!concept || concept.category !== 'capability') throw new Error(`Unknown GenOS capability: ${descriptor.capabilityId}`);
    exportsById.set(key, descriptor);
  }

  function listExports() {
    return [...exportsById.values()].map((entry) => projectEntry(entry));
  }

  function inspect(capabilityId, version) {
    const descriptor = exportsById.get(`${capabilityId}@${version}`);
    return descriptor ? projectEntry(descriptor) : null;
  }

  function projectEntry(descriptor) {
    const access = accessFor(descriptor.capabilityId) || {};
    const concept = capabilityGraph[descriptor.capabilityId]
      || capabilityGraph[`capability:${descriptor.capabilityId}`];
    const capabilitySummary = freezeTree({ id: concept.id, category: concept.category,
      maturity: concept.maturity, tools: [...(concept.tools || [])] });
    return Object.freeze({ ...descriptor, genosCapability: capabilitySummary, access: freezeTree(access) });
  }

  return Object.freeze({ listExports, inspect });
}

function freezeTree(value) {
  if (Array.isArray(value)) return Object.freeze(value.map(freezeTree));
  if (!value || typeof value !== 'object') return value;
  return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, child]) => [key, freezeTree(child)])));
}

module.exports = { createExportRegistry };
