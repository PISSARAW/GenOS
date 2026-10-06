'use strict';

const topologyNCEService = require('../topologyNCEService.js');

function buildNCEEnrichments(context, topology) {
  return topologyNCEService.computeNCEForTopology(
    context.task,
    topologyNCEService.buildTopologyOptions(context, topology)
  );
}

module.exports = { buildNCEEnrichments };