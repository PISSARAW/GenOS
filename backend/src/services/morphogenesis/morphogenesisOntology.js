'use strict';

const { DEFINITIONS } = require('./registry/topologyRegistry');
const { capabilitiesForOrganization } = require('../topologyCapabilityService');

const TOPOLOGY_IDS = Object.freeze(Object.keys(DEFINITIONS));

function classifyMorphologyLabel(label) {
  if (TOPOLOGY_IDS.includes(label)) return { kind: 'topology', id: label };
  if (capabilitiesForOrganization(label)) return { kind: 'organization', id: label };
  return { kind: 'unknown', id: label || null };
}

function isTopology(label) {
  return TOPOLOGY_IDS.includes(label);
}

module.exports = { TOPOLOGY_IDS, classifyMorphologyLabel, isTopology };
