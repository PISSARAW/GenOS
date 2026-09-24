'use strict';

const { validateMorphologyGraph } = require('../graph/morphologyGraphValidator');
const { checkAuthority } = require('./authorityCompatibility');
const { checkEvidence } = require('./evidenceCompatibility');
const { checkIndependence } = require('./independenceCompatibility');
const { checkLifecycle } = require('./lifecycleCompatibility');
const { checkPrivacy } = require('./privacyCompatibility');
const { checkResources } = require('./resourceCompatibility');
const { checkState } = require('./stateCompatibility');

function checkTopologyContracts(graph, contracts) {
  const errors = [];
  for (const node of graph.nodes || []) {
    if (node.kind === 'TOPOLOGY' && !contracts[node.topology] && !contracts[String(node.topology).toLowerCase()]) {
      errors.push(`node ${node.nodeId} references an unknown topology contract`);
    }
  }
  return errors;
}

function runCompatibilityChecks(graph, contracts) {
  return [
    ...checkAuthority(graph), ...checkState(graph), ...checkIndependence(graph, contracts),
    ...checkPrivacy(graph), ...checkEvidence(graph), ...checkResources(graph),
    ...checkLifecycle(graph, contracts), ...checkTopologyContracts(graph, contracts)
  ];
}

function checkMorphologyTypes(graph, contracts = {}) {
  const structure = validateMorphologyGraph(graph);
  if (!structure.valid) return { valid: false, errors: structure.errors, graphId: graph && graph.graphId };
  const errors = runCompatibilityChecks(graph, contracts);
  return { valid: errors.length === 0, errors, graphId: graph.graphId, checkedDimensions: [
    'authority', 'state', 'independence', 'privacy', 'evidence', 'resources', 'lifecycle'
  ] };
}

module.exports = { checkMorphologyTypes };
