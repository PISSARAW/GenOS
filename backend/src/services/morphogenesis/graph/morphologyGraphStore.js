'use strict';

const { createMorphologyGraph } = require('./morphologyGraph');
const { validateMorphologyGraph } = require('./morphologyGraphValidator');
const { snapshotMorphologyGraph } = require('./morphologyGraphSnapshot');

function createMorphologyGraphStore() {
  const graphs = new Map();

  function save(input) {
    const graph = createMorphologyGraph(input);
    const validation = validateMorphologyGraph(graph);
    if (!validation.valid) throw new Error(`Invalid morphology graph: ${validation.errors.join('; ')}`);
    const versions = graphs.get(graph.graphId) || [];
    const latest = versions[versions.length - 1];
    if (latest && graph.version <= latest.version) throw new Error('graph version must increase monotonically');
    versions.push(snapshotMorphologyGraph(graph));
    graphs.set(graph.graphId, versions);
    return snapshotMorphologyGraph(graph);
  }

  function get(graphId, version) {
    const versions = graphs.get(graphId) || [];
    const found = version === undefined ? versions[versions.length - 1] : versions.find((item) => item.version === version);
    return found ? snapshotMorphologyGraph(found) : null;
  }

  function listVersions(graphId) {
    return (graphs.get(graphId) || []).map((graph) => graph.version);
  }

  return { save, get, listVersions };
}

module.exports = { createMorphologyGraphStore };
