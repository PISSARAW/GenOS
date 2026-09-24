'use strict';

const assert = require('node:assert/strict');
const { validateMorphologyGraph } = require('../src/services/morphogenesis/graph/morphologyGraphValidator');

const TOPOLOGIES = ['a_team', 'biocenose', 'biome', 'holobionte', 'metapopulation', 'rhizome', 'syncytium', 'trinity'];

function node(nodeId, topology, parentNodeId) {
  return { nodeId, topology, kind: 'TOPOLOGY', parentNodeId: parentNodeId || null, workers: [], capabilities: [], budget: {} };
}

function composition(rootTopology, children) {
  const nodes = [node('root', rootTopology)];
  for (const [index, topology] of children.entries()) nodes.push(node(`child-${index}`, topology, 'root'));
  const graph = { graphId: `graph-${rootTopology}`, rootNodeId: 'root', nodes, edges: [], version: 1 };
  const result = validateMorphologyGraph(graph);
  assert.equal(result.valid, true, `${rootTopology} composition should be structurally valid: ${result.errors.join(', ')}`);
  return graph;
}

function run() {
  const iconic = [
    ['a_team', ['syncytium']], ['a_team', ['trinity']],
    ['trinity', ['a_team', 'a_team', 'a_team']], ['rhizome', ['a_team']],
    ['biocenose', ['trinity']], ['metapopulation', ['syncytium', 'syncytium']],
    ['biome', ['metapopulation']], ['holobionte', ['a_team', 'trinity']]
  ];
  for (const [root, children] of iconic) composition(root, children);
  composition('a_team', TOPOLOGIES);
  const incompatibleOutput = { graphId: 'invalid', rootNodeId: 'r', nodes: [node('r', 'a_team')], edges: [{ edgeId: 'bad', type: 'COMMUNICATES', fromNodeId: 'r', toNodeId: 'missing' }] };
  assert.equal(validateMorphologyGraph(incompatibleOutput).valid, false, 'unknown adapter endpoint must fail composition validation');
  console.log('Morphogenesis compositions: passed');
}

run();
