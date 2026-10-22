'use strict';

const { validateMorphologyGraph } = require('../graph/morphologyGraphValidator');
const { formalResults, checkFormalCompatibility } = require('../graph/morphologyTypeChecker');
const { compositionAdapterErrors } = require('./compositionAdapterCompatibility');

function checkTopologyContracts(graph, contracts) {
  const errors = [];
  for (const node of graph.nodes || []) {
    if (node.kind === 'TOPOLOGY' && !contracts[node.topology] && !contracts[String(node.topology).toLowerCase()]) {
      errors.push(`node ${node.nodeId} references an unknown topology contract`);
    }
  }
  return errors;
}

function checkMorphologyTypes(graph, contracts = {}) {
  const structure = validateMorphologyGraph(graph);
  if (!structure.valid) return { valid: false, errors: structure.errors, graphId: graph && graph.graphId };
  const errors = [];
  const results = formalResults();
  checkFormalCompatibility({ graph, contracts, errors, results });
  errors.push(...checkTopologyContracts(graph, contracts), ...compositionAdapterErrors(graph, contracts));
  return {
    valid: errors.length === 0,
    errors,
    graphId: graph.graphId,
    ...results,
    checkedDimensions: [
      'authority', 'state', 'independence', 'privacy', 'evidence', 'resources', 'lifecycle'
    ]
  };
}

module.exports = { checkMorphologyTypes };
