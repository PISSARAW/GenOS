'use strict';

const { reachable, validateFunctionalEquivalence } = require('./axolotlRegenerationHelpers');
const { error, hash } = require('./axolotlStateStore');

function resolveComponent(topology, id) {
  return topology.components.find((node) => node.id === id || node.regeneratedFrom === id);
}

function route(topology, input) {
  const from = resolveComponent(topology, input.from);
  const to = resolveComponent(topology, input.to);
  if (!from || !to || !reachable(topology, { from: from.id, to: to.id })) throw error('AXOLOTL_ROUTE_UNREACHABLE');
  return { delivered: true, from: from.id, to: to.id, payload: structuredClone(input.payload) };
}

function recall(topology, input) {
  const knowledge = topology.knowledge || {};
  if (!Object.hasOwn(knowledge, input.key)) throw error('AXOLOTL_KNOWLEDGE_NOT_FOUND');
  return structuredClone(knowledge[input.key]);
}

function probe(topology, item) {
  try {
    const actual = item.kind === 'route' ? route(topology, item).payload : recall(topology, item);
    return { id: item.id, passed: hash(actual) === hash(item.expected), actualHash: hash(actual) };
  } catch (failure) { return { id: item.id, passed: false, code: failure.code }; }
}

function evaluate(input) {
  const structural = validateFunctionalEquivalence(input.topology, input.contract);
  const probes = input.contract.probes.map((item) => probe(input.topology, item));
  return { passed: structural.passed && probes.every((item) => item.passed), checks: structural.checks, probes,
    events: probes.length, topologyHash: hash(input.topology), contractHash: hash(input.contract) };
}

module.exports = { route, recall, evaluate };
