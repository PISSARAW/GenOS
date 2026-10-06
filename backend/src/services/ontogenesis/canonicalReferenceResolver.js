'use strict';
const runtimeRegistry = require('../conceptRegistryService');
const capabilityGraph = require('../capabilityGraphService');
const inventory = require('./canonicalConceptInventory');
const { CONCEPT_DEFINITIONS } = require('../../philosophy/conceptDefinitions');
const { CAPABILITY_ALIASES, PHILOSOPHY_ALIASES, RUNTIME_ALIASES } = require('./canonicalConceptAliases');

function indexConcepts(entries, normalize) {
  const index = new Map();
  for (const entry of entries) {
    const names = [entry.concept.id, ...(entry.concept.aliases || [])];
    for (const name of names) {
      const key = normalize(name);
      if (!index.has(key)) index.set(key, entry);
    }
  }
  return index;
}

function indexDocuments(normalize) {
  const index = new Map();
  for (const entry of inventory.entries()) {
    const key = normalize(entry.id);
    if (!index.has(key)) index.set(key, entry);
  }
  return index;
}

function createLookup(normalize) {
  return {
    runtime: indexConcepts(Object.values(runtimeRegistry.getAllConcepts()).map((concept) => ({ concept })), normalize),
    philosophy: indexConcepts(CONCEPT_DEFINITIONS.map((concept) => ({ concept })), normalize),
    graph: indexConcepts(Object.entries(capabilityGraph.getAllConcepts()).map(([graphKey, concept]) => ({ graphKey, concept })), normalize),
    documentation: indexDocuments(normalize)
  };
}

function adapterResolution(input, helpers) {
  const adapter = helpers.adapters[input.target];
  if (!adapter) return null;
  return { requested: input.requested, id: input.target, source: 'existing_adapter', available: Boolean(input.topology),
    executable: Boolean(input.topology), access: adapter.access,
    reason: input.topology ? null : 'topologie-requise', service: adapter.service };
}

function runtimeResolution(input, helpers) {
  const target = RUNTIME_ALIASES[input.target] || input.target;
  const runtime = input.lookup.runtime.get(helpers.normalize(target))?.concept;
  if (!runtime) return null;
  const execution = helpers.executionFields(runtime);
  const compatible = helpers.topologyAllows(input.topology, runtime);
  return { requested: input.requested, id: runtime.id, source: 'runtime', available: compatible,
    executable: execution.executable && compatible, reason: compatible ? null : 'topologie-incompatible',
    compatibleTopologies: runtime.compatibleTopologies, tools: runtime.tools || [],
    primitives: runtime.primitives || [], unavailablePrimitives: execution.unavailablePrimitives };
}

function capabilityResolution(input, helpers) {
  const id = CAPABILITY_ALIASES[input.target] || input.target;
  const catalog = input.capabilities || helpers.capabilityCatalog();
  const entry = catalog.find((item) => item.capability === id || helpers.normalize(item.capability) === id.toLowerCase());
  if (!entry) return null;
  const available = entry.state === 'operationnel';
  return { requested: input.requested, id: entry.capability, source: 'capability', available, executable: available,
    reason: available ? null : `capacite-${entry.state}`, tools: entry.tools };
}

function philosophyResolution(input, helpers) {
  const target = PHILOSOPHY_ALIASES[input.target] || input.target;
  const concept = input.lookup.philosophy.get(helpers.normalize(target))?.concept;
  if (!concept) return null;
  const contract = helpers.getContract(concept);
  const available = helpers.topologyAllows(input.topology, { tools: ['genos_philosophy'] });
  return { requested: input.requested, id: concept.id, source: 'philosophy', available,
    executable: false, access: 'read', reason: available ? 'lecture-philosophique' : 'outil-lecture-non-autorise',
    tools: ['genos_philosophy'], status: concept.status, service: concept.service || null,
    implementationContract: contract, implementationContractReference: helpers.referenceFor(contract) };
}

function graphExecutable(concept) {
  return Boolean(concept.tools.length || (concept.primitives.length && concept.handlers.length === concept.primitives.length));
}

function graphResolution(input, helpers) {
  const entry = input.lookup.graph.get(input.target);
  if (!entry) return null;
  const { concept, graphKey } = entry;
  const available = helpers.topologyAllows(input.topology, { tools: concept.tools, compatibleTopologies: concept.compatible_topologies });
  return { requested: input.requested, id: concept.id, source: 'capability_graph', available,
    executable: available && graphExecutable(concept), reason: available ? null : 'topologie-incompatible',
    graphKey,
    tools: concept.tools, primitives: concept.primitives, handlers: concept.handlers };
}

function documentationResolution(input, helpers) {
  const entry = input.lookup.documentation.get(input.target);
  if (!entry) return null;
  return { requested: input.requested, id: entry.id, source: 'documentation', available: false,
    executable: false, reason: 'concept-documentaire-sans-raccord-runtime', domain: entry.domain };
}

function resolveReference(input, helpers) {
  const requested = helpers.requestedId(input.reference);
  const source = { ...input, requested, target: helpers.normalize(requested),
    lookup: input.lookup || createLookup(helpers.normalize) };
  const resolvers = [
    () => adapterResolution(source, helpers),
    () => helpers.workerReference(requested, source.target),
    () => helpers.lifecycleReference(requested, source.target),
    () => runtimeResolution(source, helpers),
    () => capabilityResolution(source, helpers),
    () => helpers.interfaceReference(requested, source.target),
    () => helpers.centralChainReference(requested, source.target),
    () => philosophyResolution(source, helpers),
    () => graphResolution(source, helpers),
    () => documentationResolution(source, helpers),
  ];
  for (const resolve of resolvers) {
    const result = resolve();
    if (result) return result;
  }
  return { requested, id: requested, source: 'unknown', available: false, executable: false, reason: 'concept-inconnu' };
}

module.exports = { resolveReference, graphExecutable, createLookup };
