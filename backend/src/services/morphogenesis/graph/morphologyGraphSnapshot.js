'use strict';

const { createMorphologyGraph } = require('./morphologyGraph');

function snapshotMorphologyGraph(graph) {
  return JSON.parse(JSON.stringify(createMorphologyGraph(graph)));
}

function restoreMorphologyGraph(snapshot) {
  return createMorphologyGraph(snapshot);
}

module.exports = { snapshotMorphologyGraph, restoreMorphologyGraph };
