'use strict';

const { contractFor, nodesById } = require('./typingHelpers');

function outputType(contract) {
  const output = contract.outputSemantics || {};
  return output.type || output.produces || null;
}

function inputTypes(contract) {
  const input = contract.inputSemantics || {};
  return Array.isArray(input.accepts) ? input.accepts : input.type ? [input.type] : [];
}

function semanticsCompatible(output, input) {
  const produced = outputType(output);
  const accepted = inputTypes(input);
  return !produced || accepted.length === 0 || accepted.includes(produced);
}

function compositionAdapterErrors(graph, contracts) {
  const byId = nodesById(graph);
  const adapters = contracts.adapters;
  return (graph.nodes || []).flatMap((node) => {
    const parent = byId.get(node.parentNodeId);
    if (!parent || !node.topology || !parent.topology) return [];
    return pairErrors({ parent, node, contracts, adapters });
  });
}

function pairErrors(input) {
  const { parent, node, contracts, adapters } = input;
  const parentContract = contractFor(parent, contracts);
  const childContract = contractFor(node, contracts);
  if (semanticsCompatible(childContract, parentContract)) return [];
  if (!adapters || typeof adapters.get !== 'function') return [`${node.topology} output requires an adapter for ${parent.topology}`];
  const adapter = adapters.get(node.topology, parent.topology);
  return adapter && adapter.evidenceStatus === 'verified' ? [] : [`${node.topology} to ${parent.topology} adapter is missing or unverified`];
}

module.exports = { compositionAdapterErrors, semanticsCompatible };
